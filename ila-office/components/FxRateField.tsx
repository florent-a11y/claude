"use client";
import { useEffect, useId, useRef, useState } from "react";
import { fmtRate, parseRate, rateToSubmit } from "@/lib/fx-core";

/**
 * FX rate box (IDR per 1 unit of a foreign currency) that fills itself from Bank Indonesia's reference rate for
 * the document's date and currency, the way QuickBooks does, and accepts decimals typed either way ("16,245.50",
 * "16.245,50"). A hidden input carries the clean decimal under `name`; server actions read it with `rateOf(fd, …)`.
 *
 * - `currency` / `currencyField` and `date` / `dateField`: the values, or the names of the form controls that hold
 *   them (the box follows a currency <select> and a date <input> in the same form).
 * - The BI rate is fetched from /api/fx when the box is empty or still shows a BI rate; a rate the person typed is
 *   never overwritten (a "Use BI rate" link offers it). The caption says which BI day the rate comes from.
 * - IDR: the box is disabled and submits 1.
 */
export interface FxRateFieldProps {
  name: string;
  currency?: string;
  currencyField?: string;
  date?: string;
  dateField?: string;
  defaultValue?: number | string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  /** Called with the numeric rate whenever it changes (for live IDR totals). */
  onValueChange?: (rate: number) => void;
  /** Turn the Bank Indonesia lookup off (the box is then a plain decimal field). */
  autoFetch?: boolean;
}

interface Quote { mid: number; buy: number; sell: number; rateDate: string; match: "exact" | "previous" | "latest"; note: string }

function readControl(form: HTMLFormElement | null | undefined, field?: string): string | undefined {
  if (!form || !field) return undefined;
  const el = form.elements.namedItem(field);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el.value;
  return undefined;
}

export function FxRateField({ name, currency, currencyField, date, dateField = "date", defaultValue, required, disabled, className = "input", placeholder = "e.g. 16,500.00", id, onValueChange, autoFetch = true, ...rest }: FxRateFieldProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const inputId = id ?? uid;
  const [formCurrency, setFormCurrency] = useState<string | undefined>(undefined);
  const [formDate, setFormDate] = useState<string | undefined>(undefined);
  const initial = parseRate(defaultValue ?? "");
  const [raw, setRaw] = useState(initial > 0 ? fmtRate(initial) : "");
  // Whether the current text was typed by the person (a BI rate never replaces it).
  const [manual, setManual] = useState(initial > 0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  // Follow the form's currency and date controls.
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const subs: Array<() => void> = [];
    const watch = (field: string | undefined, set: (v: string) => void) => {
      if (!field) return;
      const el = form.elements.namedItem(field);
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement)) return;
      const sync = () => set(el.value);
      sync();
      el.addEventListener("change", sync);
      el.addEventListener("input", sync);
      subs.push(() => { el.removeEventListener("change", sync); el.removeEventListener("input", sync); });
    };
    watch(currencyField, (v) => setFormCurrency(v.toUpperCase()));
    watch(dateField, setFormDate);
    return () => subs.forEach((f) => f());
  }, [currencyField, dateField]);

  const ccy = (currency ?? formCurrency ?? "").toUpperCase();
  const day = date ?? formDate ?? readControl(hiddenRef.current?.form, dateField);
  const isIDR = ccy === "IDR";
  const value = parseRate(raw);

  // Fetch Bank Indonesia's rate when the currency or date changes.
  useEffect(() => {
    if (!autoFetch || !ccy || isIDR || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) { setQuote(null); setStatus("idle"); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/fx?currency=${encodeURIComponent(ccy)}&date=${day}`, { signal: ctrl.signal, cache: "no-store" });
        const j = await res.json();
        if (!res.ok || !j.ok) { setQuote(null); setStatus("error"); setError(j.error ?? "Bank Indonesia rate unavailable"); return; }
        const q: Quote = { mid: j.mid, buy: j.buy, sell: j.sell, rateDate: j.rateDate, match: j.match, note: j.note };
        setQuote(q); setStatus("ok"); setError("");
        setManual((m) => {
          if (!m) { setRaw(fmtRate(q.mid)); onValueChange?.(q.mid); }
          return m;
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setQuote(null); setStatus("error"); setError("Bank Indonesia could not be reached; enter the rate manually.");
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ccy, day, isIDR, autoFetch]);

  const useQuote = () => { if (!quote) return; setRaw(fmtRate(quote.mid)); setManual(false); onValueChange?.(quote.mid); };
  const shown = isIDR ? "1" : focused ? raw : value > 0 ? fmtRate(value) : raw;
  const submit = isIDR ? "1" : rateToSubmit(value);
  const differs = quote && value > 0 && Math.abs(value - quote.mid) > 0.00005;
  return (
    <div>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        value={shown}
        disabled={disabled || isIDR}
        required={required && !isIDR}
        aria-label={rest["aria-label"]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => { const text = e.target.value; setRaw(text); setManual(text.trim() !== ""); onValueChange?.(parseRate(text)); }}
      />
      <input ref={hiddenRef} type="hidden" name={name} value={submit} />
      {!isIDR && ccy && (
        <p className="mt-1 text-xs text-ink-500">
          {status === "loading" && "Looking up Bank Indonesia…"}
          {status === "ok" && quote && (
            <>
              <span className={quote.match === "latest" ? "text-amber-700" : ""}>{quote.note}</span>
              {" · "}buy {fmtRate(quote.buy)} · sell {fmtRate(quote.sell)}
              {differs && <> · <button type="button" className="text-brand-600 underline" onClick={useQuote}>Use BI rate {fmtRate(quote.mid)}</button></>}
            </>
          )}
          {status === "error" && <span className="text-amber-700">{error}</span>}
          {status === "idle" && !day && "Pick the date to look up Bank Indonesia's rate."}
        </p>
      )}
    </div>
  );
}
