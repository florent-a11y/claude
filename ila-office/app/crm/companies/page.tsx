import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchesSearch } from "@/lib/crm";
import { fmtMoney } from "@/lib/money";
import { ENTITY_TYPE_LABELS, REGIONS } from "@/lib/types";
import { Page, Badge, Chips, EmptyState, statusTone, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { lookups } from "../_lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

type SP = { q?: string; status?: string; region?: string };

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
  const base = "/crm/companies";
  const counts = { lead: all.filter((c) => c.status === "lead").length, active: all.filter((c) => c.status === "active").length, inactive: all.filter((c) => c.status === "inactive").length };
  return (
    <Page title="Companies" subtitle={`${counts.active} active clients · ${counts.lead} leads · ${counts.inactive} inactive`} actions={<Link href="/crm/companies/new" className="btn-primary">New company</Link>}>
      <div className="mb-3 space-y-2 no-print">
        <Chips items={[{ href: withParams(base, sp, { status: undefined }), label: "All", active: !sp.status }, ...(["lead", "active", "inactive"] as const).map((s) => ({ href: withParams(base, sp, { status: s }), label: `${s} (${counts[s]})`, active: sp.status === s }))]} />
        <Chips items={[{ href: withParams(base, sp, { region: undefined }), label: "All regions", active: !sp.region }, ...REGIONS.map((r) => ({ href: withParams(base, sp, { region: r }), label: r, active: sp.region === r }))]} />
        <form className="flex flex-wrap items-center gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.region && <input type="hidden" name="region" value={sp.region} />}
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search name, NPWP, NIB, contact, tag…" className="input max-w-md" />
          <button className="btn-secondary">Search</button>
          <span className="ml-auto text-xs text-ink-500">{rows.length} shown</span>
        </form>
      </div>
      {rows.length === 0 ? <EmptyState title="No company matches" action={<Link href="/crm/companies/new" className="btn-primary">New company</Link>} /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Company</th><th>Type</th><th>Region</th><th>Primary contact</th><th>Subscriptions</th><th>Owner</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const active = c.subscriptions.filter((s) => !s.endedAt);
                const monthly = active.filter((s) => s.cadence === "monthly" && s.currency === "IDR").reduce((a, s) => a + s.amount, 0);
                return (
                  <tr key={c.id}>
                    <td className="pl-4 font-medium"><Link href={`/crm/companies/${c.id}`} className="hover:underline">{c.name}</Link>{c.npwp && <span className="block text-xs font-normal text-ink-500">NPWP {c.npwp}</span>}</td>
                    <td className="text-xs">{c.type === "prospect" ? "Prospect" : ENTITY_TYPE_LABELS[c.type]}</td>
                    <td className="text-xs">{c.region ?? c.country}</td>
                    <td className="text-xs">{c.primaryContactId ? <Link href={`/crm/contacts/${c.primaryContactId}`} className="hover:underline">{l.contact(c.primaryContactId)}</Link> : "—"}</td>
                    <td className="text-xs">{active.length === 0 ? "—" : <>{active.map((s) => s.label).join(", ")}{monthly > 0 && <span className="block text-ink-500">{fmtMoney(monthly, "IDR")} / month</span>}</>}</td>
                    <td className="text-xs">{l.user(c.ownerUserId)}</td>
                    <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    <td className="whitespace-nowrap text-xs">{c.entityId && <><Link className="text-brand-600 underline" href={`/books/${c.entityId}`}>Books</Link> · <Link className="text-brand-600 underline" href={`/tax/${c.entityId}`}>Tax</Link></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
