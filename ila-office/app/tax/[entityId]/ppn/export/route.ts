import { guard } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { slug } from "@/lib/util";
import { ppnRegisterForEntity } from "@/lib/tax/services";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const g = await guard("read");
  if (g instanceof Response) return g;
  const { entityId } = await params;
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) return new Response("period=YYYY-MM required", { status: 400 });
  const entity = await db.get("entities", entityId);
  if (!entity) return new Response("Not found", { status: 404 });
  const { rows, summary } = await ppnRegisterForEntity(entityId, period);
  const header = ["Direction", "Date", "Document", "Counterparty", "NPWP", "e-Faktur", "DPP", "Rate", "PPN", "Creditable", "Source"];
  const data: unknown[][] = rows.map((r) => [r.direction, r.date, r.docNumber, r.counterparty, r.npwp ?? "", r.fakturNumber ?? "", r.dpp, r.rate, r.ppn, r.creditable ? "Y" : "N", r.source]);
  data.push([], ["Summary", period], ["Output PPN", "", "", "", "", "", summary.outputDpp, "", summary.outputPpn], ["Creditable input PPN", "", "", "", "", "", summary.inputDpp, "", summary.creditableInputPpn], ["Net (positive = payable)", "", "", "", "", "", "", "", summary.net]);
  return csvResponse(header, data, `ppn-${slug(entity.name)}-${period}.csv`);
}
