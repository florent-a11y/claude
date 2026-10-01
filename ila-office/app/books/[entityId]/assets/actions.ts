"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createAsset, runDepreciation, disposeAsset } from "@/lib/books";
import { num, str } from "@/lib/util";
import { act, base } from "../shared";

const assetSchema = z.object({
  name: z.string().min(1, "Name is required").max(160), assetAccountId: z.string().min(1), accumDeprAccountId: z.string().min(1), deprExpenseAccountId: z.string().min(1),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Acquisition date is required"), cost: z.number().positive("Cost must be positive"), salvageValue: z.number().min(0).optional(),
  fiscalGroup: z.enum(["group1", "group2", "group3", "group4", "building_permanent", "building_non_permanent", "land"]), method: z.enum(["straight_line", "declining_balance"]).optional(), usefulLifeMonths: z.number().int().min(0).optional(), billId: z.string().optional(),
});

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

export async function runDepreciationAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/assets`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const period = z.string().regex(/^\d{4}-\d{2}$/, "Choose a month").parse(str(fd, "period"));
    const r = await runDepreciation(entityId, period, user.id);
    const total = r.runs.reduce((s, x) => s + x.amount, 0);
    return `${to}?ok=${encodeURIComponent(r.journal ? `Depreciation through ${period} posted: ${r.journal.number}, ${r.runs.length} asset(s), IDR ${total.toLocaleString("en-US")}` : `Nothing to post: all assets already depreciated through ${period}`)}`;
  }, to);
}

export async function disposeAssetAction(entityId: string, assetId: string, fd: FormData) {
  const to = `${base(entityId)}/assets/${assetId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), proceeds: z.number().min(0).optional(), bankAccountId: z.string().optional() }).parse({ date: str(fd, "date"), proceeds: num(fd, "proceeds", 0), bankAccountId: str(fd, "bankAccountId") });
    const j = await disposeAsset(entityId, assetId, v, user.id);
    return `${to}?ok=${encodeURIComponent(`Disposal posted (${j.number})`)}`;
  }, to);
}
