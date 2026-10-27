"use client";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Amount fields with live thousands separators ("1000000" shows as 1,000,000 while typing). Two flavours:
 *
 * - <MoneyInput name="amount" defaultValue={…} currency="IDR" />: for plain forms. The visible box is formatted;
 *   a hidden input carries the raw number under `name`, so server actions keep using `num(fd, "amount")`.
 *   When the form has a currency <select>, `currencyField="currency"` follows its choice for the decimals.
 * - <MoneyField value={raw} onChange={(raw) => …} />: for client-side line editors that keep amounts in React state
 *   as strings. `raw` is the unformatted digits ("1000000.5"), ready for Number().
 *
 * Grouping always uses commas (en-US), the decimal mark is a dot. IDR amounts take no decimals; other currencies
 * two. A leading minus is accepted when `allowNegative` is set.
 */

const MAX_DECIMALS = 2;

function decimalsFor(currency: string | undefined): number {
  return !currency || currency === "IDR" ? 0 : MAX_DECIMALS;
}

/** Keeps digits, one decimal dot and an optional leading minus; drops everything else (letters, stray commas). */
export function cleanRaw(input: string, decimals: number, allowNegative = false): string {
  let s = input.replace(/,/g, "");
  const neg = allowNegative && s.trim().startsWith("-");
  s = s.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  if (decimals === 0) s = s.replace(/\..*$/, "");
  else if (dot >= 0) s = s.slice(0, dot + 1 + decimals);
  s = s.replace(/^0+(?=\d)/, "");
  // A lone minus is kept so a negative amount can be typed sign first; MoneyInput submits it as empty.
  return (neg ? "-" : "") + s;
}

/** "1234567.8" → "1,234,567.8"; keeps a trailing dot while the user is typing the decimals. */
export function formatRaw(raw: string): string {
  if (!raw) return "";
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const [int, dec] = body.split(".");
  const grouped = int ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : dec !== undefined ? "0" : "";
  return `${neg ? "-" : ""}${grouped}${dec !== undefined ? `.${dec}` : ""}`;
}

/** Position the caret so it stays after the same digit once commas are re-inserted. */
function caretAfterFormat(formatted: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9.\-]/.test(formatted[i])) seen++;
    if (seen === digitsBeforeCaret) return i + 1;
  }
  return formatted.length;
}

export interface MoneyFieldProps {
  value: string;
  onChange: (raw: string) => void;
  currency?: string;
  allowNegative?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  onBlur?: () => void;
}

export function MoneyField({ value, onChange, currency, allowNegative = false, className = "input", placeholder = "0", id, disabled, required, autoFocus, onBlur, ...rest }: MoneyFieldProps) {
  const decimals = decimalsFor(currency);
  return (
    <input
      id={id}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      className={`${className} text-right tabular-nums`}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      aria-label={rest["aria-label"]}
      value={formatRaw(value)}
      onBlur={onBlur}
      onChange={(e) => {
        const el = e.target;
        const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/[^0-9.\-]/g, "").length;
        const raw = cleanRaw(el.value, decimals, allowNegative);
        onChange(raw);
        const formatted = formatRaw(raw);
        const pos = caretAfterFormat(formatted, before);
        requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos); } catch { /* unfocused */ } });
      }}
    />
  );
}

export interface MoneyInputProps extends Omit<MoneyFieldProps, "value" | "onChange"> {
  name: string;
  defaultValue?: number | string | null;
  /** Called with the numeric value whenever it changes (optional, for dependent fields such as FX totals). */
  onValueChange?: (value: number) => void;
  /** Plain forms: `name` of a currency <select> (or input) in the same form; its current choice sets the decimals. */
  currencyField?: string;
}

export function MoneyInput({ name, defaultValue, onValueChange, currency, currencyField, ...props }: MoneyInputProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [formCurrency, setFormCurrency] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!currencyField) return;
    const el = hiddenRef.current?.form?.elements.namedItem(currencyField);
    if (!(el instanceof HTMLSelectElement) && !(el instanceof HTMLInputElement)) return;
    const sync = () => setFormCurrency(el.value.toUpperCase());
    sync();
    el.addEventListener("change", sync);
    return () => el.removeEventListener("change", sync);
  }, [currencyField]);
  const known = !currencyField || formCurrency !== undefined;
  const effective = currencyField ? formCurrency ?? currency : currency;
  const decimals = decimalsFor(effective);
  // Until the form's currency has been read, keep any decimals of the default value rather than truncating them.
  const initial = defaultValue === undefined || defaultValue === null || defaultValue === "" ? "" : cleanRaw(String(defaultValue), known ? decimals : MAX_DECIMALS, props.allowNegative);
  const [raw, setRaw] = useState(initial);
  const uid = useId();
  // Re-sync if the surrounding form changes currency (decimals) after mount.
  useEffect(() => { if (known) setRaw((r) => cleanRaw(r, decimals, props.allowNegative)); }, [known, decimals, props.allowNegative]);
  return (
    <>
      <MoneyField {...props} id={props.id ?? uid} currency={effective} value={raw} onChange={(r) => { setRaw(r); onValueChange?.(r === "" || r === "-" ? 0 : Number(r)); }} />
      <input ref={hiddenRef} type="hidden" name={name} value={raw === "-" ? "" : raw} />
    </>
  );
}
