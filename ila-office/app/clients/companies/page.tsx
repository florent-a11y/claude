import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchesSearch } from "../_lib/search";
import { fmtMoney } from "@/lib/money";
import { ENTITY_TYPE_SHORT, REGIONS, type Company } from "@/lib/types";
import { Page, Badge, Chips, Cols, Dash, EmptyState, TableCard, statusTone, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { lookups } from "../_lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client companies" };

type SP = { q?: string; status?: string; region?: string };
const STATUS_LABELS = { lead: "Leads", active: "Active", inactive: "Inactive" } as const;

/** Monthly equivalent (IDR) of the active IDR subscriptions: monthly + quarterly / 3 + annual / 12. */
function monthlyIDR(c: Company): number {
  return Math.round(c.subscriptions.filter((s) => !s.endedAt && s.currency === "IDR").reduce((a, s) => a + (s.cadence === "monthly" ? s.amount : s.cadence === "quarterly" ? s.amount / 3 : s.amount / 12), 0));
}

export default async function Companies({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const l = await lookups();
  const all = await db.list("companies", { orderBy: "name" });
  const q = sp.q?.trim() ?? "";
  const rows = all.filter((c) => {
    if (sp.status && c.status !== sp.status) return false;
    if (sp.region && (c.region ?? "Other") !== sp.region) return false;
    return matchesSearch([c.name, c.npwp, c.nib, c.address, c.region, l.contact(c.primaryContactId), ...c.tags], q);
  });
  const base = "/clients/companies";
  const counts = { lead: all.filter((c) => c.status === "lead").length, active: all.filter((c) => c.status === "active").length, inactive: all.filter((c) => c.status === "inactive").length };
  const regions = REGIONS.filter((r) => all.some((c) => (c.region ?? "Other") === r));
  const totalMonthly = rows.reduce((a, c) => a + monthlyIDR(c), 0);
  return (
    <Page title="Client companies" subtitle={`${counts.active} active clients · ${counts.lead} leads · ${counts.inactive} inactive`} actions={<Link href="/clients/companies/new" className="btn-primary">New company</Link>}>
      <div className="mb-3 space-y-2 no-print">
        <form className="flex flex-wrap items-center gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.region && <input type="hidden" name="region" value={sp.region} />}
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search name, NPWP, NIB, contact, tag…" className="input max-w-sm" />
          <Chips items={[{ href: withParams(base, sp, { status: undefined }), label: <>All <span className="opacity-60">{all.length}</span></>, active: !sp.status }, ...(["active", "lead", "inactive"] as const).map((s) => ({ href: withParams(base, sp, { status: s }), label: <>{STATUS_LABELS[s]} <span className="opacity-60">{counts[s]}</span></>, active: sp.status === s }))]} />
          {(q || sp.status || sp.region) && <Link href={base} className="btn-ghost !px-2 !py-1 text-xs">Clear</Link>}
          <span className="ml-auto text-xs text-ink-500">{rows.length} shown</span>
        </form>
        {regions.length > 1 && <Chips items={[{ href: withParams(base, sp, { region: undefined }), label: "All regions", active: !sp.region }, ...regions.map((r) => ({ href: withParams(base, sp, { region: r }), label: r, active: sp.region === r }))]} />}
      </div>
      {rows.length === 0 ? <EmptyState title="No company matches" action={<Link href="/clients/companies/new" className="btn-primary">New company</Link>} /> : (
        <TableCard footer={totalMonthly > 0 && <span>Recurring fees of the companies shown: <span className="money font-medium text-ink-700">{fmtMoney(totalMonthly, "IDR")}</span> per month (IDR subscriptions, monthly equivalent).</span>}>
          <table className="table table-data min-w-[900px]">
            <Cols widths={[undefined, 170, 170, 150, 96, 100]} />
            <thead><tr><th>Company</th><th>Primary contact</th><th className="num">Monthly fees (IDR)</th><th>Owner</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const active = c.subscriptions.filter((s) => !s.endedAt);
                const monthly = monthlyIDR(c);
                const meta = [ENTITY_TYPE_SHORT[c.type], c.region ?? c.country, c.npwp ? `NPWP ${c.npwp}` : undefined].filter(Boolean).join(" · ");
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/companies/${c.id}`} className="cell-primary" title={c.name}>{c.name}</Link>
                      <span className="cell-sub" title={meta}>{meta}</span>
                    </td>
                    <td>{c.primaryContactId ? <Link href={`/clients/contacts/${c.primaryContactId}`} className="cell" title={l.contact(c.primaryContactId)}>{l.contact(c.primaryContactId)}</Link> : <Dash />}</td>
                    <td className="num" title={active.map((s) => `${s.label} · ${fmtMoney(s.amount, s.currency)} ${s.cadence}`).join("\n") || undefined}>
                      {monthly > 0 ? <span className="money">{fmtMoney(monthly, "IDR")}</span> : active.length > 0 ? <span className="text-xs text-ink-500">non-IDR</span> : <Dash />}
                      {active.length > 0 && <span className="cell-sub">{active.length} active service{active.length > 1 ? "s" : ""}</span>}
                    </td>
                    <td>{c.ownerUserId ? <span className="cell" title={l.user(c.ownerUserId)}>{l.user(c.ownerUserId)}</span> : <Dash />}</td>
                    <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    <td className="whitespace-nowrap text-right text-xs">{c.entityId ? <><Link className="text-brand-600 hover:underline" href={`/books/${c.entityId}`}>Books</Link><span className="mx-1 text-slate-300">·</span><Link className="text-brand-600 hover:underline" href={`/tax/${c.entityId}`}>Tax</Link></> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </Page>
  );
}
