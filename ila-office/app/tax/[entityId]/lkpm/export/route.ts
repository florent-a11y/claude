import { guard } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { slug } from "@/lib/util";
import { lkpmPackForEntity } from "@/lib/tax/services";
import { LKPM_ASSET_LABELS, type LkpmAssetCategory } from "@/lib/tax/lkpm";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const g = await guard("read");
  if (g instanceof Response) return g;
  const { entityId } = await params;
  const quarter = new URL(req.url).searchParams.get("quarter") ?? "";
  if (!/^\d{4}-Q[1-4]$/.test(quarter)) return new Response("quarter=YYYY-Qn required", { status: 400 });
  const entity = await db.get("entities", entityId);
  if (!entity) return new Response("Not found", { status: 404 });
  const p = await lkpmPackForEntity(entityId, quarter);
  const rows: unknown[][] = [
    ["Company", entity.legalName], ["NIB", entity.nib ?? ""], ["NPWP", entity.npwp ?? ""], ["Quarter", quarter], ["From", p.from], ["To", p.to],
    ...(Object.keys(LKPM_ASSET_LABELS) as LkpmAssetCategory[]).map((c) => [LKPM_ASSET_LABELS[c], p.fixedAssets[c]]),
    ["Fixed assets total", p.fixedAssetsTotal], ["Working capital (quarter opex)", p.workingCapital], ["Investment realisation", p.investmentRealisation], ["Paid-up capital", p.paidUpCapital],
    ["Revenue (quarter)", p.revenueQuarter], ["Expenses (quarter)", p.expensesQuarter], ["Employees local", p.headcount.local], ["Employees foreign", p.headcount.foreign], ["Employees total", p.headcount.total],
    ...p.foreignEmployees.map((e) => ["Foreign employee", `${e.name}${e.position ? ` (${e.position})` : ""}`]),
    ...p.assetAdditions.map((a) => ["Asset addition", `${a.date} ${a.name}`, a.cost]),
    ...p.outstandingObligations.map((o) => ["Outstanding obligation", `${o.label} ${o.period}`, o.reportDue, o.status]),
  ];
  return csvResponse(["Item", "Value", "Extra", "Status"], rows, `lkpm-${slug(entity.name)}-${quarter}.csv`);
}
