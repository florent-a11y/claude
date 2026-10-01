import { guard } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { slug } from "@/lib/util";
import { EBUPOT_HEADER, ebupotRows } from "@/lib/tax/withholding";

export const runtime = "nodejs";

/** CSV of a period's bukti potong in the e-Bupot Unifikasi import layout. */
export async function GET(req: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const g = await guard("read");
  if (g instanceof Response) return g;
  const { entityId } = await params;
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) return new Response("period=YYYY-MM required", { status: 400 });
  const [entity, slips] = await Promise.all([db.get("entities", entityId), db.list("withholding_slips", { where: { entityId, period }, orderBy: "number" })]);
  if (!entity) return new Response("Not found", { status: 404 });
  const bills = await db.getMany("bills", slips.map((s) => s.billId ?? "").filter(Boolean));
  const numbers = new Map([...bills.values()].map((b) => [b.id, b.number]));
  return csvResponse([...EBUPOT_HEADER], ebupotRows(slips, numbers), `bukti-potong-${slug(entity.name)}-${period}.csv`);
}
