"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAsset, updateAsset, deleteAsset, runDepreciation, disposeAsset } from "@/lib/books";
import { fmtMoney, roundMoney } from "@/lib/money";
import { bool, num, str } from "@/lib/util";
import { act, base, withFlash } from "../shared";

const GROUPS = ["group1", "group2", "group3", "group4", "building_permanent", "building_non_permanent", "land"] as const;
const METHODS = ["straight_line", "declining_balance"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const assetSchema = z.object({
  name: z.string().min(1, "Name is required").max(160), assetAccountId: z.string().min(1), accumDeprAccountId: z.string().min(1), deprExpenseAccountId: z.string().min(1),
  acquisitionDate: z.string().regex(ISO_DATE, "Acquisition date is required"), cost: z.number().positive("Cost must be positive"), salvageValue: z.number().min(0).optional(),
  fiscalGroup: z.enum(GROUPS), method: z.enum(METHODS).optional(), usefulLifeMonths: z.number().int().min(0).optional(), billId: z.string().optional(),
});

/** The asset page's own query (`tx`, `date`, `proceeds`, `bankAccountId` of a sale started from a statement line), carried through its forms. */
function keepQuery(fd: FormData): string {
  const keep = str(fd, "keep");
  return keep && /^[\w=&.%:-]+$/.test(keep) ? `?${keep}` : "";
}

export async function createAssetAction(entityId: string, fd: FormData) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    const v = assetSchema.parse({
      name: str(fd, "name"), assetAccountId: str(fd, "assetAccountId"), accumDeprAccountId: str(fd, "accumDeprAccountId"), deprExpenseAccountId: str(fd, "deprExpenseAccountId"), acquisitionDate: str(fd, "acquisitionDate"),
      cost: num(fd, "cost", 0), salvageValue: num(fd, "salvageValue", 0), fiscalGroup: str(fd, "fiscalGroup"), method: str(fd, "method"), usefulLifeMonths: num(fd, "usefulLifeMonths", 0) || undefined, billId: str(fd, "billId"),
    });
    const a = await createAsset(entityId, v);
    return `${base(entityId)}/assets/${a.id}?ok=${encodeURIComponent("Asset registered")}`;
  }, `${base(entityId)}/assets/new`);
}

const updateSchema = z.object({
  name: z.string().min(1, "Name is required").max(160).optional(), fiscalGroup: z.enum(GROUPS).optional(), method: z.enum(METHODS).optional(),
  usefulLifeMonths: z.number().int().min(0).optional(), salvageValue: z.number().min(0).optional(),
  assetAccountId: z.string().optional(), accumDeprAccountId: z.string().optional(), deprExpenseAccountId: z.string().optional(), notes: z.string().max(2000).optional(),
});

/**
 * Saves the asset form of the detail page. With `confirm` it also clears "needs review", which lets depreciation
 * start. Fields the form shows locked (depreciation already posted) are not sent and stay as they are.
 */
export async function updateAssetAction(entityId: string, assetId: string, fd: FormData) {
  const to = `${base(entityId)}/assets/${assetId}${keepQuery(fd)}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const confirm = bool(fd, "confirm");
    const v = updateSchema.parse({
      name: str(fd, "name"), fiscalGroup: str(fd, "fiscalGroup"), method: str(fd, "method"), usefulLifeMonths: fd.has("usefulLifeMonths") ? num(fd, "usefulLifeMonths", 0) : undefined,
      salvageValue: fd.has("salvageValue") ? num(fd, "salvageValue", 0) : undefined, assetAccountId: str(fd, "assetAccountId"), accumDeprAccountId: str(fd, "accumDeprAccountId"), deprExpenseAccountId: str(fd, "deprExpenseAccountId"),
      // An emptied box clears the notes; a form without the box leaves them.
      notes: fd.has("notes") ? str(fd, "notes") ?? "" : undefined,
    });
    const asset = await updateAsset(entityId, assetId, { ...v, confirm });
    return withFlash(to, !confirm ? "Asset updated" : asset.fiscalGroup === "land" ? "Asset confirmed (land is not depreciated)" : "Asset confirmed: the next depreciation run posts it from its acquisition month");
  }, to);
}

/** Takes an asset nothing was posted on out of the register (not a new asset after all, or a duplicate). */
export async function deleteAssetAction(entityId: string, assetId: string) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    await deleteAsset(entityId, assetId);
    return `${base(entityId)}/assets?ok=${encodeURIComponent("Asset removed from the register; the ledger is unchanged")}`;
  }, `${base(entityId)}/assets/${assetId}`);
}

export async function runDepreciationAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/assets`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const period = z.string().regex(/^\d{4}-\d{2}$/, "Choose a month").parse(str(fd, "period"));
    const r = await runDepreciation(entityId, period, user.id);
    const total = roundMoney(r.runs.reduce((s, x) => s + x.amount, 0));
    return `${to}?ok=${encodeURIComponent(r.journal ? `Depreciation through ${period} posted: ${r.journal.number}, ${r.runs.length} asset(s), IDR ${total.toLocaleString("en-US")}` : `Nothing to post: all assets already depreciated through ${period}`)}`;
  }, to);
}

/** Switches the automatic monthly depreciation of this entity on or off (lib/asset-auto.ts `runAutoDepreciation`). */
export async function setAutoDepreciationAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/assets`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const on = bool(fd, "on");
    const entity = await db.update("entities", entityId, { autoDepreciation: on, updatedAt: new Date().toISOString() });
    if (!entity) throw new Error("Entity not found.");
    return `${to}?ok=${encodeURIComponent(on ? "Automatic depreciation is on: each month is posted on the 1st of the next" : "Automatic depreciation is off: run it by hand from this page")}`;
  }, to);
}

/**
 * Sale, scrapping or write-off from the asset page. `proceedsTo` is a bank account id, "receivable" (sold on
 * credit) or "none" (no proceeds); `bankTransactionId` is the statement line the sale was started from, matched to
 * the disposal entry once it is posted.
 */
export async function disposeAssetAction(entityId: string, assetId: string, fd: FormData) {
  const page = `${base(entityId)}/assets/${assetId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = z.object({ date: z.string().regex(ISO_DATE, "Disposal date is required"), proceeds: z.number().min(0), proceedsTo: z.string().min(1), bankTransactionId: z.string().optional() })
      .parse({ date: str(fd, "date"), proceeds: num(fd, "proceeds", 0), proceedsTo: str(fd, "proceedsTo") ?? "none", bankTransactionId: str(fd, "bankTransactionId") });
    const none = v.proceedsTo === "none";
    if (!none && v.proceeds <= 0) throw new Error("Enter the proceeds, or choose “None” for an asset that was scrapped or written off.");
    const j = await disposeAsset(entityId, assetId, {
      date: v.date, proceeds: none ? 0 : v.proceeds, bankAccountId: none || v.proceedsTo === "receivable" ? undefined : v.proceedsTo, bankTransactionId: none ? undefined : v.bankTransactionId,
    }, user.id);
    const result = (await db.get("fixed_assets", assetId))?.disposalGainLoss ?? 0;
    const outcome = result > 0 ? `gain of ${fmtMoney(result)}` : result < 0 ? `loss of ${fmtMoney(-result)}` : "no gain or loss";
    return `${page}?ok=${encodeURIComponent(`Disposal posted (${j.number}): ${outcome}${!none && v.bankTransactionId ? "; the statement line is matched" : ""}`)}`;
  }, `${page}${keepQuery(fd)}`);
}

/**
 * "Sale of a fixed asset" on a statement line (money in): opens the chosen asset's Sell / dispose form prefilled
 * from the line. Nothing is posted here; the line is matched when the disposal is.
 */
export async function sellAssetFromBankAction(entityId: string, bankAccountId: string, txId: string, fd: FormData) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    const assetId = z.string().min(1, "Choose the asset that was sold").parse(str(fd, "assetId") ?? "");
    const [tx, asset, bank] = await Promise.all([db.get("bank_transactions", txId), db.get("fixed_assets", assetId), db.get("bank_accounts", bankAccountId)]);
    if (!tx || tx.entityId !== entityId || !bank || bank.entityId !== entityId || tx.bankAccountId !== bank.id) throw new Error("Bank statement line not found.");
    if (!asset || asset.entityId !== entityId) throw new Error("Asset not found.");
    if (tx.status !== "unmatched") throw new Error(`This statement line is already ${tx.status}.`);
    if (tx.amount <= 0) throw new Error("Only money in can be the sale of an asset.");
    const q = new URLSearchParams({ tx: tx.id, date: tx.date, bankAccountId: bank.id });
    // A foreign-currency line has no IDR value of its own: the accountant enters it on the asset page.
    if (bank.currency === "IDR") q.set("proceeds", String(tx.amount));
    return `${base(entityId)}/assets/${asset.id}?${q.toString()}#dispose`;
  }, `${base(entityId)}/bank/${bankAccountId}/tx/${txId}`);
}
