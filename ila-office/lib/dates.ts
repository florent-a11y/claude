/** Date helpers. All dates are `YYYY-MM-DD` strings; "today" is taken in Asia/Makassar (WITA, Bali) unless given. */

export const TZ = "Asia/Makassar";

export function todayISO(tz = TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function parseISO(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, days: number): string {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + days);
  return toISODate(x);
}

export function addMonths(d: string, months: number): string {
  const x = parseISO(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + months);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return toISODate(x);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

export function periodOf(d: string): string {
  return d.slice(0, 7);
}

export function periodLabel(period: string): string {
  if (/^\d{4}-Q[1-4]$/.test(period)) return `Q${period.slice(6)} ${period.slice(0, 4)}`;
  if (/^\d{4}$/.test(period)) return period;
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function lastDayOfMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return toISODate(new Date(Date.UTC(y, m, 0)));
}

export function firstDayOfMonth(period: string): string {
  return `${period}-01`;
}

/** Next calendar month, "2026-12" → "2027-01". */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function quarterOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}

export function isWeekend(d: string): boolean {
  const day = parseISO(d).getUTCDay();
  return day === 0 || day === 6;
}

/** ILA invoices are due 3 working days after the send date (weekends skipped; public holidays are not modelled). */
export function addWorkingDays(d: string, n: number): string {
  let out = d;
  let left = n;
  while (left > 0) {
    out = addDays(out, 1);
    if (!isWeekend(out)) left--;
  }
  return out;
}

export function fmtDate(d?: string | null, locale = "en-GB"): string {
  if (!d) return "—";
  try {
    return parseISO(d).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function monthsIn(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}
