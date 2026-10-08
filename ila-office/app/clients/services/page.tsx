import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/money";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type ServiceItem } from "@/lib/types";
import { matchesSearch } from "../_lib/search";
import { Page, Badge, Chips, Cols, Dash, EmptyState, TableCard, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { CADENCE_LABELS } from "./ServiceForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price list" };

type SP = { q?: string; category?: string; inactive?: string };
const byOrder = (a: ServiceItem, b: ServiceItem) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code);


export default async function Services({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const write = can(me, "crm:write");
  const all = (await db.list("services")).sort(byOrder);
  const q = sp.q?.trim() ?? "";
  const rows = all.filter((s) => (sp.inactive ? true : s.active) && (!sp.category || s.category === sp.category) && matchesSearch([s.code, s.name, s.description, s.includesNote, s.unit], q));
  const base = "/clients/services";
  const categories = SERVICE_CATEGORIES.filter((c) => all.some((s) => s.category === c && (sp.inactive || s.active)));
  const groups = (sp.category ? [sp.category as ServiceItem["category"]] : categories).map((c) => ({ category: c, items: rows.filter((s) => s.category === c) })).filter((g) => g.items.length > 0);
  const activeCount = all.filter((s) => s.active).length;
  return (
    <Page title="Price list" subtitle={`${activeCount} active services · list prices in IDR, with the USD/EUR figures ILA actually quotes.`}
      actions={<>
        <Link href={withParams(base, sp, { inactive: sp.inactive ? undefined : "1" })} className="btn-secondary">{sp.inactive ? "Hide inactive" : "Show inactive"}</Link>
        {write && <Link href="/clients/services/new" className="btn-primary">New service</Link>}
      </>}>
      <div className="mb-3 space-y-2 no-print">
        <form className="flex flex-wrap items-center gap-2">
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          {sp.inactive && <input type="hidden" name="inactive" value={sp.inactive} />}
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search code, name, description…" className="input max-w-sm" />
          {(q || sp.category) && <Link href={base} className="btn-ghost !px-2 !py-1 text-xs">Clear</Link>}
          <span className="ml-auto text-xs text-ink-500">{rows.length} shown</span>
        </form>
        <Chips items={[{ href: withParams(base, sp, { category: undefined }), label: "All", active: !sp.category }, ...categories.map((c) => ({ href: withParams(base, sp, { category: c }), label: SERVICE_CATEGORY_LABELS[c], active: sp.category === c }))]} />
      </div>
      {all.length === 0 ? <EmptyState title="The price list is empty" hint="Run the seed script or add a service." action={write && <Link href="/clients/services/new" className="btn-primary">New service</Link>} /> :
        rows.length === 0 ? <EmptyState title="No service matches" /> : (
        <TableCard>
          <table className="table table-data min-w-[960px]">
            <Cols widths={[140, undefined, 100, 130, 150, 150, ...(write ? [56] : [])]} />
            <thead><tr><th>Code</th><th>Service</th><th>Unit</th><th className="num">Price (IDR)</th><th className="num">Also quoted</th><th>Billing</th>{write && <th></th>}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.category} label={`${SERVICE_CATEGORY_LABELS[g.category]} · ${g.items.length}`} showHeader={groups.length > 1} span={write ? 7 : 6}>
                  {g.items.map((s) => (
                    <tr key={s.id} className={s.active ? "" : "text-ink-500"}>
                      <td><span className="cell font-mono text-xs" title={s.code}>{s.code}</span></td>
                      <td>
                        <span className="cell-primary" title={s.description ? `${s.name}\n${s.description}` : s.name}>{s.name}{s.taxTreatment === "ppn" && <Badge tone="blue" className="ml-2 align-middle">PPN</Badge>}{!s.active && <Badge className="ml-2 align-middle">inactive</Badge>}</span>
                        {(s.includesNote || s.description) && <span className="cell-sub" title={s.includesNote ?? s.description}>{s.includesNote ?? s.description}</span>}
                      </td>
                      <td className="text-xs">{s.unit}</td>
                      <td className="num">{s.priceIDR > 0 ? <span className="money">{fmtMoney(s.priceIDR, "IDR")}</span> : <span className="text-xs text-ink-500" title="Quoted per proposal">on quote</span>}</td>
                      <td className="num text-xs">{s.priceUSD || s.priceEUR ? <span className="money">{[s.priceUSD ? fmtMoney(s.priceUSD, "USD") : "", s.priceEUR ? fmtMoney(s.priceEUR, "EUR") : ""].filter(Boolean).join(" · ")}</span> : <Dash />}</td>
                      <td><span className="cell text-xs">{CADENCE_LABELS[s.cadence] ?? s.cadence}</span>{s.renewalMonths ? <span className="cell-sub">renew after {s.renewalMonths} months</span> : null}</td>
                      {write && <td className="text-right text-xs"><Link href={`/clients/services/${s.id}`} className="text-brand-600 hover:underline">Edit</Link></td>}
                    </tr>
                  ))}
                </GroupRows>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </Page>
  );
}

function GroupRows({ label, showHeader, span, children }: { label: string; showHeader: boolean; span: number; children: ReactNode }) {
  return <>{showHeader && <tr className="group-row"><td colSpan={span}>{label}</td></tr>}{children}</>;
}
