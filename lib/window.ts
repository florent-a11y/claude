/**
 * The official portal accepts arrival card submissions only inside the 72 hours before arrival.
 * All calculations use the arrival date at 00:00 Jakarta time (UTC+7), like the ops console.
 * This file has no server-only imports so the form and the API share the same maths.
 */
export const WINDOW_HOURS = 72;
/** Once the arrival date is more than a day in the past we treat the order as too late. */
export const PAST_HOURS = -24;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function arrivalInstant(arrivalDate: string) {
  return new Date(arrivalDate + "T00:00:00+07:00").getTime();
}

/** Rounded hours from now until 00:00 Jakarta time on the arrival date. */
export function hoursUntilArrival(arrivalDate: string, now = Date.now()) {
  return Math.round((arrivalInstant(arrivalDate) - now) / 3.6e6);
}

/** The instant at which the official window opens for this arrival date. */
export function windowOpensAt(arrivalDate: string) {
  return new Date(arrivalInstant(arrivalDate) - WINDOW_HOURS * 3.6e6);
}

export type WindowState = "too_early" | "open" | "past";

export function windowState(hoursLeft: number): WindowState {
  if (hoursLeft > WINDOW_HOURS) return "too_early";
  if (hoursLeft < PAST_HOURS) return "past";
  return "open";
}

/** e-VOA can be applied for up to 90 days ahead; arrival card and bundle are gated. */
export function isWindowGated(product: string) {
  return product !== "evoa";
}

/** Today's date (YYYY-MM-DD) in Jakarta time. */
export function todayJakarta(now = Date.now()) {
  return new Date(now + 7 * 3.6e6).toISOString().slice(0, 10);
}

/** Human date such as "Monday 5 October 2026, 08:00". Uses the caller's time zone unless one is given;
 *  `locale` is a BCP 47 tag (ops tooling and reminder emails keep en-GB). */
export function formatWindowOpens(arrivalDate: string, timeZone?: string, locale: string = "en-GB") {
  const d = windowOpensAt(arrivalDate);
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" };
  if (timeZone) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat(locale, opts).format(d);
}
