import Link from "next/link";
import type { ReactNode } from "react";
import { fmtMoney } from "@/lib/money";

/** Server-safe presentational building blocks shared by every module. Keep them dependency-free. */

export function Page({ title, subtitle, actions, children, breadcrumbs }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; breadcrumbs?: Array<{ href?: string; label: string }> }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 text-xs text-ink-500">
          {breadcrumbs.map((b, i) => (
            <span key={i}>{i > 0 && <span className="mx-1">/</span>}{b.href ? <Link href={b.href} className="hover:underline">{b.label}</Link> : b.label}</span>
          ))}
        </nav>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-ink-700">{title}</h2>{actions}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className="card @container min-w-0 !p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 whitespace-nowrap text-lg font-bold tabular-nums @min-[13rem]:text-xl @min-[17rem]:text-2xl ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export type Tone = "slate" | "green" | "amber" | "red" | "blue" | "indigo" | "brand" | "accent";
const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700", green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800", indigo: "bg-indigo-100 text-indigo-800", brand: "bg-brand-100 text-brand-700", accent: "bg-amber-50 text-accent-600",
};
export function Badge({ tone = "slate", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`pill ${TONES[tone]} ${className}`}>{children}</span>;
}

/** Generic status → tone mapping used by the modules (extend locally where needed). */
export function statusTone(status: string): Tone {
  if (/(done|paid|posted|reported|closed_won|accepted|renewed|active|approved|matched)/.test(status)) return "green";
  if (/(late|overdue|void|lost|declined|lapsed|cancelled|unmatched)/.test(status)) return "red";
  if (/(waiting|awaiting|requested|reminded|sent|submitted|partial)/.test(status)) return "amber";
  if (/(progress|preparation|qualified|review|quoted|received)/.test(status)) return "blue";
  if (/(draft|new|prospect|not_started|upcoming|inactive|lead|dormant)/.test(status)) return "slate";
  return "slate";
}

export function Money({ amount, currency = "IDR", className = "" }: { amount: number; currency?: string; className?: string }) {
  return <span className={`whitespace-nowrap tabular-nums ${amount < 0 ? "text-red-700" : ""} ${className}`}>{fmtMoney(amount, currency)}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-ink-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className = "" }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}</label>;
}

export function Select({ name, value, defaultValue, options, className = "input", required, id }: { name: string; value?: string; defaultValue?: string; options: Array<{ value: string; label: string }> | readonly string[]; className?: string; required?: boolean; id?: string }) {
  const opts = (options as ReadonlyArray<string | { value: string; label: string }>).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <select name={name} id={id} value={value} defaultValue={defaultValue} className={className} required={required}>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function DL({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[fit-content(45%)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {items.map(([k, v], i) => <div key={i} className="contents"><dt className="text-ink-500">{k}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{v ?? "—"}</dd></div>)}
    </dl>
  );
}

/** Horizontal tab links; `current` is matched by prefix. */
export function Tabs({ tabs, current }: { tabs: Array<{ href: string; label: string; count?: number }>; current: string }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 text-sm no-print">
      {tabs.map((t) => {
        const active = current === t.href || (t.href !== "/" && current.startsWith(t.href + "/")) || current === t.href;
        return (
          <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-3 py-2 ${active ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"}`}>
            {t.label}{t.count !== undefined && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Filter chips: links that toggle a query parameter. */
export function Chips({ items }: { items: Array<{ href: string; label: ReactNode; active?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm no-print">
      {items.map((c, i) => <Link key={i} href={c.href} className={`rounded-full px-3 py-1 ring-1 ring-slate-200 ${c.active ? "bg-brand-600 text-white" : "bg-white hover:bg-brand-50"}`}>{c.label}</Link>)}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "green" | "blue"; children: ReactNode }) {
  const cls = { amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-800", green: "border-green-200 bg-green-50 text-green-800", blue: "border-blue-200 bg-blue-50 text-blue-800" }[tone];
  return <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}

/** Builds a URL for the current page with some query params replaced (drops empty values). */
export function withParams(base: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}
