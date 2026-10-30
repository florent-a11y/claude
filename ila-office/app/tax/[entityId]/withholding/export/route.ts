import { guard } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { slug } from "@/lib/util";
import { xlsxResponse } from "@/lib/report-xlsx";
import { CORETAX_HEADER, coretaxRows, coretaxXml } from "@/lib/tax/withholding";

export const runtime = "nodejs";

/**
 * A period's bukti potong in the Coretax bulk-import layout.
 * ?period=YYYY-MM&format=csv|xlsx|xml[&kind=BPPU|BP21]  (xml needs the kind: Coretax imports BPPU and BP21 separately).
 */
export async function GET(req: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const g = await guard("read", entityId);
  if (g instanceof Response) return g;
  const q = new URL(req.url).searchParams;
  const period = q.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) return new Response("period=YYYY-MM required", { status: 400 });
  const format = (q.get("format") ?? "csv").toLowerCase();
  const [entity, slips] = await Promise.all([db.get("entities", entityId), db.list("withholding_slips", { where: { entityId, period }, orderBy: "number" })]);
  if (!entity) return new Response("Not found", { status: 404 });
  const bills = await db.getMany("bills", slips.map((s) => s.billId ?? "").filter(Boolean));
  const numbers = new Map([...bills.values()].map((b) => [b.id, b.number]));
  const name = `bukti-potong-${slug(entity.name)}-${period}`;
  if (format === "xml") {
    const kind = q.get("kind") === "BP21" ? "BP21" : "BPPU";
    const xml = coretaxXml(slips, entity, kind, numbers);
    return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="${name}-${kind}.xml"`, "cache-control": "private, no-store" } });
  }
  const rows = coretaxRows(slips, entity, numbers);
  if (format === "xlsx" || format === "excel") {
    const headers: string[] = [...CORETAX_HEADER];
    const idx = (h: string) => headers.indexOf(h);
    const bppu = rows.filter((r) => r[0] === "BPPU");
    const bp21 = rows.filter((r) => r[0] === "BP21");
    return xlsxResponse([
      { name: "BPPU", headers, rows: bppu },
      { name: "BP21", headers, rows: bp21 },
      { name: "Semua", headers, rows },
    ].map((s) => ({ ...s, colWidths: headers.map((h, i) => (i === idx("Nama Objek Pajak") || i === idx("Nama Penerima") ? 36 : 16)) })), `${name}.xlsx`);
  }
  return csvResponse([...CORETAX_HEADER], rows, `${name}.csv`);
}
