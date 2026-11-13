"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { str } from "@/lib/util";
import type { VisibilityCompetitor } from "@/lib/types";
import { hostOf } from "@/lib/visibility/analyze";
import { claudeError, suggestPrompts } from "@/lib/visibility/claude";
import { getConfig, saveConfig } from "@/lib/visibility/config";

/** Server actions of the AI visibility module. Consultants and admins write; every team role reads. */

const list = (v: string | undefined) => [...new Set((v ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
const hosts = (v: string | undefined) => [...new Set(list(v).map(hostOf).filter(Boolean))];
const done = (path: string, message?: string): never => {
  revalidatePath("/visibility", "layout");
  redirect(message ? `${path}?msg=${encodeURIComponent(message)}` : path);
};

export async function saveSettings(fd: FormData) {
  await requirePermission("crm:write");
  const config = await getConfig();
  const brandName = str(fd, "brandName")?.slice(0, 120);
  const domains = hosts(str(fd, "domains"));
  if (!brandName || domains.length === 0) done("/visibility/settings", "A brand name and at least one domain are required.");
  await saveConfig({ ...config, brandName: brandName!, brandAliases: list(str(fd, "brandAliases")).slice(0, 12), domains: domains.slice(0, 8), description: (str(fd, "description") ?? "").slice(0, 1500) });
  done("/visibility/settings", "Saved.");
}

export async function addCompetitor(fd: FormData) {
  await requirePermission("crm:write");
  const back = str(fd, "back") === "sources" ? "/visibility/sources" : "/visibility/competitors";
  const config = await getConfig();
  const domains = hosts(str(fd, "domains"));
  const name = (str(fd, "name") ?? domains[0]?.split(".")[0] ?? "").slice(0, 80);
  if (!name) done(back, "Give the competitor a name.");
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  const next: VisibilityCompetitor = { name: display, aliases: list(str(fd, "aliases")).slice(0, 8), domains: domains.slice(0, 6) };
  const others = config.competitors.filter((c) => c.name.toLowerCase() !== display.toLowerCase());
  await saveConfig({ ...config, competitors: [...others, next] });
  done(back, `${display} is now tracked. Past answers are re-scored with it.`);
}

export async function removeCompetitor(name: string) {
  await requirePermission("crm:write");
  const config = await getConfig();
  await saveConfig({ ...config, competitors: config.competitors.filter((c) => c.name !== name) });
  done("/visibility/competitors");
}

export async function addPrompt(fd: FormData) {
  await requirePermission("crm:write");
  const text = str(fd, "text")?.replace(/\s+/g, " ").slice(0, 300);
  if (!text || text.length < 8) done("/visibility/prompts", "Write the question as a prospect would type it (8 characters or more).");
  const all = await db.list("visibility_prompts");
  if (all.some((p) => p.text.toLowerCase() === text!.toLowerCase())) done("/visibility/prompts", "That prompt is already tracked.");
  await db.insert("visibility_prompts", { id: db.newId(), text: text!, topic: str(fd, "topic")?.slice(0, 40), active: true, createdAt: nowISO() });
  done("/visibility/prompts", "Added. It is asked from the next run.");
}

export async function setPromptActive(id: string, active: boolean) {
  await requirePermission("crm:write");
  await db.update("visibility_prompts", id, { active });
  done("/visibility/prompts");
}

/** Removes the prompt and every answer stored for it. */
export async function deletePrompt(id: string) {
  await requirePermission("crm:write");
  for (const a of await db.list("visibility_answers", { where: { promptId: id } })) await db.remove("visibility_answers", a.id);
  await db.remove("visibility_prompts", id);
  done("/visibility/prompts");
}

/** Asks Claude for new buyer questions and stores them switched off, for the team to review. */
export async function suggestMorePrompts() {
  await requirePermission("crm:write");
  const [config, all] = await Promise.all([getConfig(), db.list("visibility_prompts")]);
  let found: Array<{ text: string; topic: string }> = [];
  try {
    found = await suggestPrompts(config, all.map((p) => p.text));
  } catch (e) {
    done("/visibility/prompts", claudeError(e));
  }
  const createdAt = nowISO();
  await db.insertMany("visibility_prompts", found.map((p) => ({ id: db.newId(), text: p.text.replace(/\s+/g, " ").slice(0, 300), topic: p.topic.slice(0, 40), active: false, createdAt })));
  done("/visibility/prompts", found.length ? `${found.length} suggestions added below, switched off. Track the ones you want.` : "No new suggestion this time.");
}

export async function saveArticle(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const markdown = String(fd.get("markdown") ?? "").replace(/\r\n?/g, "\n").trim();
  const title = str(fd, "title")?.slice(0, 200);
  if (!title || markdown.length < 50) done(`/visibility/articles/${id}`, "A title and the article text are required.");
  const publishedUrl = str(fd, "publishedUrl");
  const okUrl = publishedUrl && /^https?:\/\//i.test(publishedUrl) ? publishedUrl.slice(0, 500) : undefined;
  await db.update("visibility_articles", id, { title: title!, markdown, metaDescription: str(fd, "metaDescription")?.slice(0, 300), publishedUrl: okUrl, status: okUrl ? "published" : "draft" });
  done(`/visibility/articles/${id}`, "Saved.");
}

export async function deleteArticle(id: string) {
  await requirePermission("crm:write");
  await db.remove("visibility_articles", id);
  done("/visibility/articles");
}
