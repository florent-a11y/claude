"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { isLive, parseFaq, parseLines, parseSources, parseTags, postInputSchema, slugify, type Post, type PostInput } from "@/lib/blog";
import { samplePosts } from "@/lib/blog-seed";
import { getProduct } from "@/lib/catalog";
import { PHOTOS } from "@/lib/photos";
import { refreshBlog } from "@/lib/posts";
import { pingIndexNow } from "@/lib/seo";
import { localizedPath } from "@/i18n/routing";
import { canReview, staff } from "@/lib/admin";
import { ORDER_STATUSES, PAY_METHODS, type OrderStatus, type PayMethod } from "@/lib/schema";
import { deletePost, getLead, getOrder, listPosts, saveLead, savePost } from "@/lib/store";
import { markPaid, reviewOrder, setOpsNotes, setStatus } from "@/lib/orders";

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

async function load(form: FormData) {
  const order = await getOrder(str(form, "id"));
  if (!order) throw new Error("Order not found");
  return order;
}
function done(id: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/** Doctor's decision: the ticked prescription lines are approved, the others removed. "decline" removes them all. */
export async function reviewAction(form: FormData) {
  const who = await staff();
  if (!canReview(who)) throw new Error("Only the doctor sign-in can review prescription items");
  const order = await load(form);
  const approved = str(form, "decision") === "decline" ? [] : form.getAll("approve").map(String);
  await reviewOrder(order, `doctor:${who.user}`, approved, str(form, "note"));
  done(order.id);
}

/** Staff confirm money received by hand: a checked bank transfer, cash or QRIS on delivery. */
export async function markPaidAction(form: FormData) {
  const who = await staff();
  const order = await load(form);
  const method = str(form, "method") as PayMethod;
  if (!PAY_METHODS.includes(method)) throw new Error("Unknown payment method");
  await markPaid(order, `${who.role}:${who.user}`, method);
  done(order.id);
}

export async function statusAction(form: FormData) {
  const who = await staff();
  const order = await load(form);
  const status = str(form, "status") as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) throw new Error("Unknown status");
  await setStatus(order, `${who.role}:${who.user}`, status);
  done(order.id);
}

export async function notesAction(form: FormData) {
  const who = await staff();
  const order = await load(form);
  await setOpsNotes(order, `${who.role}:${who.user}`, str(form, "notes"));
  done(order.id);
}

export async function leadHandledAction(form: FormData) {
  await staff();
  const lead = await getLead(str(form, "id"));
  if (lead) await saveLead({ ...lead, handledAt: lead.handledAt ? undefined : new Date().toISOString() });
  revalidatePath("/admin/leads");
}

// ---------- Blog ----------

export interface SaveResult { ok: boolean; id?: string; error?: string }

/** Saves an article from the editor. Returns the id (new articles get one here) or a message to show the writer. */
export async function savePostAction(input: PostInput): Promise<SaveResult> {
  const who = await staff();
  const parsed = postInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Please check: ${parsed.error.issues[0]?.path.join(".")} (${parsed.error.issues[0]?.message})` };
  const d = parsed.data;
  const all = await listPosts();
  const existing = d.id ? all.find((p) => p.id === d.id) : undefined;
  if (d.id && !existing) return { ok: false, error: "This article no longer exists." };

  // The address must be unique within a language: a clash gets "-2", "-3"…
  const base = slugify(d.slug || d.title) || "article";
  const taken = new Set(all.filter((p) => p.locale === d.locale && p.id !== existing?.id).map((p) => p.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const now = new Date().toISOString();
  const id = existing?.id ?? randomUUID();
  const when = d.publishedAt && !Number.isNaN(Date.parse(d.publishedAt)) ? new Date(d.publishedAt).toISOString() : undefined;
  const post: Post = {
    id, locale: d.locale, slug, translationKey: d.translationKey || existing?.translationKey || id,
    title: d.title, excerpt: d.excerpt, takeaways: parseLines(d.takeaways, 8), body: d.body.trim(),
    cover: d.cover in PHOTOS ? d.cover : "", tags: parseTags(d.tags), author: d.author, reviewer: d.reviewer,
    sources: parseSources(d.sources), faq: parseFaq(d.faq), related: d.related.filter((s) => getProduct(s)),
    status: d.status, createdAt: existing?.createdAt ?? now, updatedAt: now,
    publishedAt: d.status === "published" ? (when ?? existing?.publishedAt ?? now) : (when ?? existing?.publishedAt),
  };
  await savePost(post);
  refreshBlog();
  revalidatePath("/admin/blog");
  if (isLive(post, new Date())) after(() => pingIndexNow([localizedPath(post.locale, `/blog/${post.slug}`), localizedPath(post.locale, "/blog")]));
  console.log(`[blog] ${who.role}:${who.user} saved ${post.locale}/${post.slug} (${post.status})`);
  return { ok: true, id };
}

export async function deletePostAction(form: FormData) {
  await staff();
  await deletePost(str(form, "id"));
  refreshBlog();
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

/** Adds the sample articles (lib/blog-seed.ts). Safe to run twice: the samples have fixed ids. */
export async function addSamplePostsAction() {
  await staff();
  for (const post of samplePosts()) await savePost(post);
  refreshBlog();
  revalidatePath("/admin/blog");
}
