/**
 * Bank Indonesia reference rates (Kurs Transaksi BI), server side: reads the published page, caches every
 * currency of a day in the `fx_rates` table and answers "IDR per 1 unit on this date" for the forms and the
 * month-end revaluation.
 *
 * - BI publishes one table per working day (selling and buying rate per currency; JPY per 100). The mid rate
 *   (kurs tengah = (jual + beli) / 2) is what the books use, as QuickBooks did; buy and sell are kept for reference.
 * - The page shows the latest day; earlier days come from its date form, posted the way the page's own script does
 *   (an ASP.NET postback on the search button). A day without a publication (weekend, holiday) answers with no
 *   rows: the last published day before it is used, up to LOOKBACK_DAYS back, exactly as the accountants do by hand.
 * - Everything fails soft: a network error or a page BI changed the shape of gives `null`, the forms then ask for
 *   the rate by hand. Nothing here throws for a missing rate.
 * - A daily sync (app/api/fx/sync, Vercel cron) caches the latest table so most lookups never leave the database.
 */
import { db } from "./db";
import { addDays, isWeekend, todayISO } from "./dates";
import { parseBiRatesPage, perUnit, type BiRatesPage } from "./fx-core";
import type { FxRate } from "./types";

export const BI_PAGE_URL = "https://www.bi.go.id/en/statistik/informasi-kurs/transaksi-bi/default.aspx";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
/** How many days before the requested date a published rate is still accepted (long weekends with holidays). */
export const LOOKBACK_DAYS = 7;

export type FxMatch = "exact" | "previous" | "latest";
export interface FxLookup {
  rate: FxRate;
  /** "exact": BI published on that day. "previous": last publication before it. "latest": only BI's latest table could be read. */
  match: FxMatch;
  fromCache: boolean;
}

export function fxRateId(currency: string, date: string): string {
  return `bi:${currency.toUpperCase()}:${date}`;
}

/** The hidden ASP.NET fields of the page (replayed on the postback). */
function hiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*>/gi)) out[m[1]] = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
  return out;
}

/** Cookies set by the GET, replayed on the POST (ASP.NET session). */
function cookieHeader(res: Response): string | undefined {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const pairs = raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
  return pairs.length ? pairs.join("; ") : undefined;
}

const HEADERS = { "user-agent": USER_AGENT, accept: "text/html", "accept-language": "en" };

/** One visit to the page: the latest table plus the ability to ask for earlier days. */
export interface BiSession {
  latest: BiRatesPage;
  /** The table of one day (`rows` empty when BI published nothing that day), or null when the postback failed. */
  lookup(date: string): Promise<BiRatesPage | null>;
}

/** Opens the page; null when BI cannot be reached or the page no longer carries the rate table. */
export async function openBiSession(): Promise<BiSession | null> {
  let res: Response;
  try { res = await fetch(BI_PAGE_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }); } catch { return null; }
  if (!res.ok) return null;
  const html = await res.text();
  const latest = parseBiRatesPage(html);
  if (latest.rows.length === 0 || !latest.asOf) return null;
  const hidden = hiddenFields(html);
  const prefix = html.match(/name="(ctl00[^"]*\$)txtTanggal"/)?.[1];
  const cookie = cookieHeader(res);
  return {
    latest,
    async lookup(date) {
      if (date >= (latest.asOf as string)) return latest;
      if (!prefix) return null;
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(hidden)) if (k.startsWith("__") || k.endsWith("hidSourceID")) body.set(k, v);
      // The page's search button is an ASP.NET postback: the server reads the date when the button is the event target.
      body.set("__EVENTTARGET", `${prefix}btnSearch2`);
      body.set("__EVENTARGUMENT", "");
      const [y, m, d] = date.split("-");
      body.set(`${prefix}txtTanggal`, `${d}/${m}/${y}`);
      try {
        const post = await fetch(BI_PAGE_URL, {
          method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { ...HEADERS, "content-type": "application/x-www-form-urlencoded", referer: BI_PAGE_URL, ...(cookie ? { cookie } : {}) },
        });
        if (!post.ok) return null;
        // The "Last Update" caption keeps the latest day on every answer; the rows are those of the day asked for.
        return { asOf: date, rows: parseBiRatesPage(await post.text()).rows };
      } catch { return null; }
    },
  };
}

/** Turns a day's table into cache rows (`date` = `rateDate` = the publication day). */
export function pageToRates(page: BiRatesPage, fetchedAt = new Date().toISOString()): FxRate[] {
  if (!page.asOf) return [];
  return page.rows.map((r) => {
    const q = perUnit(r);
    return { id: fxRateId(r.currency, page.asOf as string), source: "bi" as const, currency: r.currency, date: page.asOf as string, rateDate: page.asOf as string, buy: q.buy, sell: q.sell, mid: q.mid, units: r.units, fetchedAt };
  });
}

async function storeRates(rows: FxRate[]): Promise<void> {
  await Promise.all(rows.map((r) => db.upsert("fx_rates", r)));
}

export interface BiDayResult { page: BiRatesPage; /** The day whose table this is (the latest publication, or an earlier day found by looking back). */ method: "latest" | "lookup" }

/**
 * The table in force on `date`: the day itself when BI published, else the last published day before it (weekends
 * are skipped without asking, holidays are probed day by day). Null when BI cannot be reached or nothing was
 * published in the lookback window.
 */
export async function fetchBiRatesFor(date: string, session?: BiSession | null): Promise<BiDayResult | null> {
  const s = session ?? (await openBiSession());
  if (!s) return null;
  if (date >= (s.latest.asOf as string)) return { page: s.latest, method: "latest" };
  for (let i = 0; i <= LOOKBACK_DAYS; i++) {
    const day = addDays(date, -i);
    if (isWeekend(day)) continue;
    const page = await s.lookup(day);
    if (page === null) return null;
    if (page.rows.length > 0) return { page, method: "lookup" };
  }
  return null;
}

/** Fetches BI's table (the latest, or the one in force on `date`) and caches every currency. Used by the daily sync. */
export async function syncBiRates(date?: string): Promise<{ asOf: string; currencies: number; method: "latest" | "lookup" } | null> {
  const r = date ? await fetchBiRatesFor(date) : await (async () => { const s = await openBiSession(); return s ? { page: s.latest, method: "latest" as const } : null; })();
  if (!r || !r.page.asOf) return null;
  const rows = pageToRates(r.page);
  const toStore = [...rows];
  if (date && r.page.asOf < date && date < todayISO()) toStore.push(...rows.map((x) => ({ ...x, id: fxRateId(x.currency, date), date })));
  await storeRates(toStore);
  return { asOf: r.page.asOf, currencies: rows.length, method: r.method };
}

/**
 * IDR per 1 unit of `currency` on `date` (ISO), from the cache or from BI. Dates in the future are read as today.
 * `null` when the currency is unknown to BI or BI cannot be reached and nothing is cached.
 */
export async function getFxRate(currency: string, date: string, session?: BiSession | null): Promise<FxLookup | null> {
  const ccy = currency.toUpperCase();
  if (ccy === "IDR") return null;
  const today = todayISO();
  const day = date > today ? today : date;
  // 1. Cache: the day itself, then the days before it.
  const ids = Array.from({ length: LOOKBACK_DAYS + 1 }, (_, i) => fxRateId(ccy, addDays(day, -i)));
  const cached = await db.getMany("fx_rates", ids);
  for (const id of ids) {
    const row = cached.get(id);
    if (!row) continue;
    // Today's publication may still come when the cached row for today points at an earlier day: ask again.
    if (row.date === today && row.rateDate < today) break;
    return { rate: row, match: row.rateDate === day ? "exact" : "previous", fromCache: true };
  }
  // 2. Bank Indonesia.
  const fetched = await fetchBiRatesFor(day, session);
  if (!fetched || !fetched.page.asOf) return null;
  const rows = pageToRates(fetched.page);
  const asOf = fetched.page.asOf;
  const match: FxMatch = asOf === day ? "exact" : asOf < day ? "previous" : "latest";
  const toStore = [...rows];
  // Remember the lookup under the requested day too, so a weekend or holiday is not asked again (never for today,
  // whose publication may still come).
  const alias = match === "previous" && day < today;
  if (alias) toStore.push(...rows.map((r) => ({ ...r, id: fxRateId(r.currency, day), date: day })));
  await storeRates(toStore);
  const hit = rows.find((r) => r.currency === ccy);
  if (!hit) return null;
  return { rate: alias ? { ...hit, id: fxRateId(ccy, day), date: day } : hit, match, fromCache: false };
}

/** Closing rates for several currencies on one day (the month-end revaluation); currencies BI does not quote are left out. */
export async function getFxRates(currencies: string[], date: string): Promise<Record<string, FxLookup>> {
  const out: Record<string, FxLookup> = {};
  let session: BiSession | null | undefined;
  for (const c of [...new Set(currencies.map((x) => x.toUpperCase()))].filter((x) => x !== "IDR")) {
    if (session === undefined) session = null; // opened lazily below only when the cache misses
    const r = await getFxRate(c, date, session ?? undefined);
    if (r) out[c] = r;
  }
  return out;
}
