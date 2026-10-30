"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Generic type-ahead picker (the chart-of-accounts picker's engine, reusable): type part of any word of an option
 * and choose with the mouse or the keyboard. Works uncontrolled (`name` → hidden input with the chosen id) and
 * controlled (`value` + `onChange`). With `allowCustom`, text that matches nothing can be kept as a free value
 * (`onChange(text, null)`), for codes or names that are not in the list yet. The list renders in a portal with
 * fixed positioning so table cells never clip it.
 */
export interface ComboOption {
  id: string;
  /** Main text, e.g. a code or a name. */
  primary: string;
  /** Secondary text shown after the primary (e.g. a label); searched too. */
  secondary?: string;
  /** Optional group header (options are listed in the order given; a header is printed when the group changes). */
  group?: string;
  /** Extra searchable words (ids, aliases). */
  keywords?: string;
  /** Short note shown on the right of the row. */
  note?: string;
}

function norm(s: string): string { return s.toLowerCase().replace(/\s+/g, " ").trim(); }

export function optionMatches(o: ComboOption, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const hay = `${o.primary} ${o.secondary ?? ""} ${o.keywords ?? ""}`.toLowerCase();
  return q.split(" ").every((w) => hay.includes(w));
}

export interface ComboboxProps {
  options: ComboOption[];
  value?: string;
  onChange?: (id: string, option: ComboOption | null) => void;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  allowCustom?: boolean;
  /** How a chosen option is shown in the box (default: "primary · secondary"). */
  display?: (o: ComboOption) => string;
  emptyText?: string;
  "aria-label"?: string;
  /** Called when the list closes without a choice (e.g. to keep a custom text). */
  onBlurText?: (text: string) => void;
}

export function Combobox({ options, value, onChange, name, defaultValue, placeholder = "Type to search…", className = "input", required, disabled, id, allowCustom, display, emptyText, onBlurText, ...rest }: ComboboxProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const selectedId = controlled ? value : inner;
  const selected = useMemo(() => options.find((o) => o.id === selectedId) ?? null, [options, selectedId]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const uid = useId();
  const inputId = id ?? uid;
  const label = (o: ComboOption) => (display ? display(o) : o.secondary ? `${o.primary} · ${o.secondary}` : o.primary);
  const flat = useMemo(() => {
    const q = norm(query);
    const matched = options.filter((o) => optionMatches(o, query));
    if (!q) return matched;
    // Exact code first, then codes starting with the query, then everything else in list order.
    const rank = (o: ComboOption) => { const p = o.primary.toLowerCase(); return p === q ? 0 : p.startsWith(q) ? 1 : 2; };
    return matched.map((o, i) => ({ o, i, r: rank(o) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.o);
  }, [options, query]);

  function choose(o: ComboOption | null, custom?: string) {
    const idValue = o ? o.id : custom ?? "";
    if (!controlled) setInner(idValue);
    onChange?.(idValue, o);
    setQuery("");
    setOpen(false);
  }
  function openList() {
    setQuery("");
    setOpen(true);
    const i = selectedId ? flat.findIndex((o) => o.id === selectedId) : -1;
    setActive(i >= 0 ? i : 0);
  }
  function close() {
    if (allowCustom && query.trim() && !flat.some((o) => o.id === query.trim())) { choose(null, query.trim()); onBlurText?.(query.trim()); return; }
    setOpen(false); setQuery("");
  }
  function place() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 240 && r.top > spaceBelow;
    setRect({ top: up ? r.top : r.bottom, left: r.left, width: Math.max(r.width, 360), up });
  }
  useLayoutEffect(() => { if (open) place(); }, [open, query]);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); document.removeEventListener("mousedown", onDown); };
  });
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!open || !rect) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, rect]);

  const customShown = allowCustom && selectedId && !selected ? selectedId : "";
  const shown = open ? query : selected ? label(selected) : customShown;

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
          else if (e.key === "Enter") { if (open) { e.preventDefault(); if (flat[active]) choose(flat[active]); else close(); } }
          else if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); setQuery(""); } }
          else if (e.key === "Backspace" && !query && selectedId) { choose(null); setOpen(true); }
          else if (e.key === "Tab") { close(); }
        }}
      />
      {name && <input type="hidden" name={name} value={selectedId ?? ""} />}
      {open && rect && typeof document !== "undefined" && createPortal(
        <div ref={listRef} id={`${inputId}-list`} role="listbox" className="fixed z-[1000] max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl" style={{ left: rect.left, width: rect.width, ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }) }}>
          {flat.length === 0 && <div className="px-3 py-2 text-xs text-ink-500">{emptyText ?? (allowCustom ? `No match. Press Enter to use “${query}”.` : `No match for “${query}”.`)}</div>}
          {flat.map((o, i) => {
            const groupStart = o.group && (i === 0 || flat[i - 1].group !== o.group);
            return (
              <div key={o.id}>
                {groupStart && <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{o.group}</div>}
                <div role="option" aria-selected={o.id === selectedId} data-index={i} className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 ${i === active ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50"} ${o.id === selectedId ? "font-semibold" : ""}`} onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
                  <span className="shrink-0 font-mono text-xs text-ink-500">{o.primary}</span>
                  {o.secondary && <span className="min-w-0 flex-1 truncate">{o.secondary}</span>}
                  {o.note && <span className="shrink-0 text-xs text-ink-500">{o.note}</span>}
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
