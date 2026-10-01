"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO, todayISO } from "@/lib/dates";
import { num, str } from "@/lib/util";
import { QUOTE_TERMS } from "@/lib/catalogue";
import { QUOTE_CURRENCIES, defaultValidUntil, normaliseLines, quoteTotals, stageAfterQuote } from "@/lib/crm";
import type { Quote, QuoteLine } from "@/lib/types";
import { logActivity } from "../_lib/server";
import { moveDealStage } from "../_lib/deals";

const lineSchema = z.object({
  id: z.string().optional(),
  serviceId: z.string().optional(),
  description: z.string().min(1).max(500),
  qty: z.number(),
  unitPrice: z.number(),
  note: z.string().max(300).optional(),
});
const schema = z.object({
  title: z.string().min(1).max(200),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  currency: z.enum(QUOTE_CURRENCIES),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
  discount: z.number().min(0),
  validUntil: z.iso.date(),
  terms: z.string().max(5000),
  scopeNotes: z.string().max(5000).optional(),
  documentsNeeded: z.string().max(5000).optional(),
});

function read(fd: FormData) {
  let rawLines: unknown = [];
  try { rawLines = JSON.parse(str(fd, "lines") ?? "[]"); } catch { rawLines = []; }
  const v = schema.parse({
    title: str(fd, "title"), companyId: str(fd, "companyId"), contactId: str(fd, "contactId"), dealId: str(fd, "dealId"),
    currency: (str(fd, "currency") ?? "IDR").toUpperCase(), lines: rawLines, discount: num(fd, "discount"), validUntil: str(fd, "validUntil") ?? defaultValidUntil(todayISO()),
    terms: str(fd, "terms") ?? QUOTE_TERMS, scopeNotes: str(fd, "scopeNotes"), documentsNeeded: str(fd, "documentsNeeded"),
  });
  const lines: QuoteLine[] = normaliseLines(v.lines.map((l) => ({ ...l, id: l.id || db.newId(), serviceId: l.serviceId || undefined, note: l.note || undefined })), v.currency);
  const totals = quoteTotals(lines, v.currency, v.discount);
  return { ...v, lines, ...totals, discount: totals.discount, quoteDiscount: v.discount };
}

export async function createQuote(fd: FormData) {
  const user = await requirePermission("crm:write");
  const v = read(fd);
  const now = nowISO();
  const quote: Quote = {
    id: db.newId(), number: await db.nextNumber("global", "Q"), title: v.title, companyId: v.companyId, contactId: v.contactId, dealId: v.dealId, currency: v.currency,
    lines: v.lines, subtotal: v.subtotal, discount: v.quoteDiscount, total: v.total, validUntil: v.validUntil, terms: v.terms, scopeNotes: v.scopeNotes, documentsNeeded: v.documentsNeeded,
    status: "draft", preparedByUserId: user.id, createdAt: now,
  };
  await db.insert("quotes", quote);
  if (quote.dealId) await db.update("deals", quote.dealId, { quoteId: quote.id, updatedAt: now });
  await logActivity({ kind: "system", subject: `Quote ${quote.number} created`, body: `${quote.currency} ${quote.total}`, user, quoteId: quote.id, dealId: quote.dealId, companyId: quote.companyId, contactId: quote.contactId });
  revalidatePath("/crm/quotes");
  redirect(`/crm/quotes/${quote.id}`);
}

export async function updateQuote(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const current = await db.get("quotes", id);
  if (!current) throw new Error("Quote not found");
  if (current.status === "accepted") throw new Error("An accepted quote cannot be edited; duplicate it instead.");
  const v = read(fd);
  const now = nowISO();
  await db.update("quotes", id, {
    title: v.title, companyId: v.companyId, contactId: v.contactId, dealId: v.dealId, currency: v.currency, lines: v.lines, subtotal: v.subtotal, discount: v.quoteDiscount, total: v.total,
    validUntil: v.validUntil, terms: v.terms, scopeNotes: v.scopeNotes, documentsNeeded: v.documentsNeeded, updatedAt: now,
  });
  if (v.dealId && v.dealId !== current.dealId) await db.update("deals", v.dealId, { quoteId: id, updatedAt: now });
  revalidatePath("/crm/quotes");
  revalidatePath(`/crm/quotes/${id}`);
  redirect(`/crm/quotes/${id}`);
}

async function load(id: string) {
  const q = await db.get("quotes", id);
  if (!q) throw new Error("Quote not found");
  return q;
}

export async function markQuoteSent(id: string) {
  const user = await requirePermission("crm:write");
  const q = await load(id);
  const now = nowISO();
  await db.update("quotes", id, { status: "sent", sentAt: q.sentAt ?? now, updatedAt: now });
  if (q.dealId) {
    const deal = await db.get("deals", q.dealId);
    if (deal) {
      await db.update("deals", q.dealId, { quoteId: id, amount: deal.amount || q.total, currency: deal.amount ? deal.currency : q.currency, updatedAt: now });
      await moveDealStage(q.dealId, stageAfterQuote(deal.stage, "sent"), user);
    }
  }
  await logActivity({ kind: "status", subject: `Quote ${q.number} sent`, body: `Valid until ${q.validUntil}`, user, quoteId: id, dealId: q.dealId, companyId: q.companyId, contactId: q.contactId });
  revalidatePath("/crm/quotes");
  revalidatePath(`/crm/quotes/${id}`);
}

export async function acceptQuote(id: string) {
  const user = await requirePermission("crm:write");
  const q = await load(id);
  const now = nowISO();
  await db.update("quotes", id, { status: "accepted", acceptedAt: now, updatedAt: now });
  if (q.dealId) {
    const deal = await db.get("deals", q.dealId);
    if (deal) {
      await db.update("deals", q.dealId, { quoteId: id, amount: q.total, currency: q.currency, updatedAt: now });
      await moveDealStage(q.dealId, stageAfterQuote(deal.stage, "accepted"), user);
    }
  }
  await logActivity({ kind: "status", subject: `Quote ${q.number} accepted`, body: `${q.currency} ${q.total}`, user, quoteId: id, dealId: q.dealId, companyId: q.companyId, contactId: q.contactId });
  revalidatePath("/crm/quotes");
  revalidatePath(`/crm/quotes/${id}`);
  redirect(`/crm/quotes/${id}?accepted=1`);
}

export async function declineQuote(id: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const q = await load(id);
  const reason = str(fd, "reason");
  await db.update("quotes", id, { status: "declined", updatedAt: nowISO() });
  await logActivity({ kind: "status", subject: `Quote ${q.number} declined`, body: reason, user, quoteId: id, dealId: q.dealId, companyId: q.companyId, contactId: q.contactId });
  revalidatePath("/crm/quotes");
  revalidatePath(`/crm/quotes/${id}`);
}

/** Back to draft (e.g. a sent quote that must be corrected). */
export async function reopenQuote(id: string) {
  const user = await requirePermission("crm:write");
  const q = await load(id);
  await db.update("quotes", id, { status: "draft", updatedAt: nowISO() });
  await logActivity({ kind: "status", subject: `Quote ${q.number} back to draft`, user, quoteId: id, dealId: q.dealId, companyId: q.companyId, contactId: q.contactId });
  revalidatePath(`/crm/quotes/${id}`);
}

export async function duplicateQuote(id: string) {
  const user = await requirePermission("crm:write");
  const q = await load(id);
  const now = nowISO();
  const copy: Quote = {
    ...q, id: db.newId(), number: await db.nextNumber("global", "Q"), lines: q.lines.map((l) => ({ ...l, id: db.newId() })), status: "draft", validUntil: defaultValidUntil(todayISO()),
    preparedByUserId: user.id, createdAt: now, sentAt: undefined, acceptedAt: undefined, updatedAt: undefined,
  };
  await db.insert("quotes", copy);
  await logActivity({ kind: "system", subject: `Quote ${copy.number} duplicated from ${q.number}`, user, quoteId: copy.id, dealId: copy.dealId, companyId: copy.companyId, contactId: copy.contactId });
  revalidatePath("/crm/quotes");
  redirect(`/crm/quotes/${copy.id}/edit`);
}

export async function deleteQuote(id: string) {
  await requirePermission("crm:write");
  const q = await load(id);
  if (q.status !== "draft") throw new Error("Only draft quotes can be deleted");
  await db.remove("quotes", id);
  if (q.dealId) { const d = await db.get("deals", q.dealId); if (d?.quoteId === id) await db.update("deals", q.dealId, { quoteId: undefined }); }
  revalidatePath("/crm/quotes");
  redirect("/crm/quotes");
}
