"use client";
import { useEffect, useId, useState } from "react";

/**
 * Amount fields with live thousands separators ("1000000" shows as 1,000,000 while typing). Two flavours:
 *
 * - <MoneyInput name="amount" defaultValue={…} currency="IDR" />: for plain forms. The visible box is formatted;
 *   a hidden input carries the raw number under `name`, so server actions keep using `num(fd, "amount")`.
 * - <MoneyField value={raw} onChange={(raw) => …} />: for client-side line editors that keep amounts in React state
 *   as strings. `raw` is the unformatted digits ("1000000.5"), ready for Number().
 *
 * Grouping always uses commas (en-US), the decimal mark is a dot. IDR amounts take no decimals; other currencies
 * two. A leading minus is accepted when `allowNegative` is set.
 */

function decimalsFor(currency: string | undefined): number {
  return !currency || currency === "IDR" ? 0 : 2;
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
  return (neg && s ? "-" : "") + s;
}

/** "1234567.8" → "1,234,567.8"; keeps a trailing dot while the user is typing the decimals. */
export function formatRaw(raw: string): string {
  if (!raw) return "";
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const [int, dec] = body.split(".");
  const grouped = (int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
}

export function MoneyInput({ name, defaultValue, onValueChange, currency, ...props }: MoneyInputProps) {
  const decimals = decimalsFor(currency);
  const initial = defaultValue === undefined || defaultValue === null || defaultValue === "" ? "" : cleanRaw(String(defaultValue), decimals, props.allowNegative);
  const [raw, setRaw] = useState(initial);
  const uid = useId();
  // Re-sync if the surrounding form changes currency (decimals) after mount.
  useEffect(() => { setRaw((r) => cleanRaw(r, decimals, props.allowNegative)); }, [decimals, props.allowNegative]);
  return (
    <>
      <MoneyField {...props} id={props.id ?? uid} currency={currency} value={raw} onChange={(r) => { setRaw(r); onValueChange?.(r === "" || r === "-" ? 0 : Number(r)); }} />
      <input type="hidden" name={name} value={raw === "-" ? "" : raw} />
    </>
  );
}
