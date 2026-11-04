import { guard } from "@/lib/auth";
import { getFxRate } from "@/lib/fx";
import { fmtDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fx?currency=USD&date=2026-10-30 → Bank Indonesia's rate for the forms' FX rate boxes:
 * { ok, currency, date, rateDate, buy, sell, mid, units, match, fromCache, note }. `mid` is IDR per 1 unit.
 * Any signed-in user may ask (the rate is public information); 404 when BI has no rate and nothing is cached.
 */
export async function GET(req: Request) {
  const user = await guard("read");
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams;
  const currency = (q.get("currency") ?? "").toUpperCase();
  const date = q.get("date") ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) return Response.json({ ok: false, error: "currency must be a 3-letter code" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  if (currency === "IDR") return Response.json({ ok: true, currency, date, rateDate: date, buy: 1, sell: 1, mid: 1, units: 1, match: "exact", fromCache: true, note: "" });
  const r = await getFxRate(currency, date);
  if (!r) return Response.json({ ok: false, error: `Bank Indonesia has no rate for ${currency} (or could not be reached); enter the rate manually.` }, { status: 404, headers: { "cache-control": "private, no-store" } });
  const note = r.match === "exact" ? `Bank Indonesia mid rate, ${fmtDate(r.rate.rateDate)}`
    : r.match === "previous" ? `Bank Indonesia mid rate of ${fmtDate(r.rate.rateDate)} (last publication before ${fmtDate(date)})`
    : `Bank Indonesia's latest mid rate, ${fmtDate(r.rate.rateDate)}: the rate of ${fmtDate(date)} could not be retrieved`;
  return Response.json(
    { ok: true, currency, date, rateDate: r.rate.rateDate, buy: r.rate.buy, sell: r.rate.sell, mid: r.rate.mid, units: r.rate.units, match: r.match, fromCache: r.fromCache, note },
    { headers: { "cache-control": "private, no-store" } },
  );
}
