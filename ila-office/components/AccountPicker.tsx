"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Chart-of-accounts picker with type-ahead: type a few letters of the code or the name and pick from the matches.
 * Works in plain forms (`name` → hidden input with the account id) and in client-side line editors
 * (`value` + `onChange`). The list is rendered in a portal with fixed positioning, so it is never clipped by table
 * cells that hide overflow.
 */
export interface AccountOption { id: string; code: string; name: string; type?: string; subtype?: string }

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABEL: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };

function norm(s: string): string { return s.toLowerCase().replace(/\s+/g, " ").trim(); }

export function accountMatches(a: AccountOption, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const hay = `${a.code} ${a.name}`.toLowerCase();
  // Every word of the query must appear somewhere (code or name), so "bank bca" and "1-11" both work.
  return q.split(" ").every((w) => hay.includes(w));
}

export interface AccountPickerProps {
  accounts: AccountOption[];
  /** Controlled value (account id). */
  value?: string;
  onChange?: (id: string, account: AccountOption | null) => void;
  /** Uncontrolled: initial id; the hidden input `name` carries the chosen id. */
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  /** Group the list by account type (default on when accounts carry a type). */
  grouped?: boolean;
  "aria-label"?: string;
}

export function AccountPicker({ accounts, value, onChange, name, defaultValue, placeholder = "Type code or name…", className = "input", required, disabled, id, grouped, ...rest }: AccountPickerProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const selectedId = controlled ? value : inner;
  const selected = useMemo(() => accounts.find((a) => a.id === selectedId) ?? null, [accounts, selectedId]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const uid = useId();
  const inputId = id ?? uid;

  const label = (a: AccountOption) => `${a.code} · ${a.name}`;
  const matches = useMemo(() => accounts.filter((a) => accountMatches(a, query)), [accounts, query]);
  const useGroups = grouped ?? accounts.some((a) => a.type);
  const flat = useMemo(() => {
    if (!useGroups) return matches;
    return [...matches].sort((x, y) => (TYPE_ORDER.indexOf(x.type ?? "") - TYPE_ORDER.indexOf(y.type ?? "")) || x.code.localeCompare(y.code));
  }, [matches, useGroups]);

  function choose(a: AccountOption | null) {
    if (!controlled) setInner(a?.id ?? "");
    onChange?.(a?.id ?? "", a);
    setQuery("");
    setOpen(false);
  }

  /** Opens the full list with the current selection highlighted, so Enter or the arrows start from it instead of the first row. */
  function openList() {
    setQuery("");
    setOpen(true);
    const i = selectedId ? flat.findIndex((a) => a.id === selectedId) : -1;
    setActive(i >= 0 ? i : 0);
  }

  function place() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 240 && r.top > spaceBelow;
    setRect({ top: up ? r.top : r.bottom, left: r.left, width: Math.max(r.width, 320), up });
  }

  useLayoutEffect(() => { if (open) place(); }, [open, query]);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false); setQuery("");
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!open || !rect) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, rect]);

  const shown = open ? query : selected ? label(selected) : "";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${inputId}-list`}
        aria-autocomplete="list"
        aria-label={rest["aria-label"]}
        autoComplete="off"
        className={className}
        placeholder={selected ? label(selected) : placeholder}
        value={shown}
        disabled={disabled}
        required={required && !selectedId}
        onFocus={() => { if (!open) openList(); }}
        onClick={() => { if (!open) openList(); }}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.min(flat.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { if (open && flat[active]) { e.preventDefault(); choose(flat[active]); } }
          else if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); setQuery(""); } }
          else if (e.key === "Backspace" && !query && selected) { choose(null); setOpen(true); }
          else if (e.key === "Tab") { setOpen(false); setQuery(""); }
        }}
      />
      {name && <input type="hidden" name={name} value={selectedId ?? ""} />}
      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={listRef}
          id={`${inputId}-list`}
          role="listbox"
          className="fixed z-[1000] max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
          style={{ left: rect.left, width: rect.width, ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }) }}
        >
          {flat.length === 0 && <div className="px-3 py-2 text-xs text-ink-500">No account matches “{query}”.</div>}
          {flat.map((a, i) => {
            const groupStart = useGroups && (i === 0 || flat[i - 1].type !== a.type);
            return (
              <div key={a.id}>
                {groupStart && <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{TYPE_LABEL[a.type ?? ""] ?? a.type}</div>}
                <div
                  role="option"
                  aria-selected={a.id === selectedId}
                  data-index={i}
                  className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 ${i === active ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50"} ${a.id === selectedId ? "font-semibold" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); choose(a); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="shrink-0 font-mono text-xs text-ink-500">{a.code}</span>
                  <span className="truncate">{a.name}</span>
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
