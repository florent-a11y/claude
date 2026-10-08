import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchesSearch, phoneDigits } from "../_lib/search";
import { fullName } from "@/lib/util";
import { Page, Cols, Dash, EmptyState, TableCard, TagList, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { lookups } from "../_lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; owner?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const l = await lookups();
  const all = await db.list("contacts", { orderBy: "createdAt", desc: true });
  const q = sp.q?.trim() ?? "";
  const qDigits = phoneDigits(q);
  const rows = all.filter((c) => {
    if (sp.owner && c.ownerUserId !== sp.owner) return false;
    if (!q) return true;
    const companies = c.companyIds.map((id) => l.company(id));
    if (qDigits.length >= 4 && (phoneDigits(c.phone).includes(qDigits) || phoneDigits(c.whatsapp).includes(qDigits))) return true;
    return matchesSearch([fullName(c), c.email, c.phone, c.whatsapp, c.nationality, c.passportNumber, ...companies, ...c.tags], q);
  });
  const base = "/clients/contacts";
  return (
    <Page title="Contacts" subtitle={`${all.length} people · investors, directors, visa holders, referrers`} actions={<Link href="/clients/contacts/new" className="btn-primary">New contact</Link>}>
      <form className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <AutoSubmitInput name="q" defaultValue={q} placeholder="Search name, email, phone, nationality, company, tag…" className="input max-w-md" />
        {sp.owner && <input type="hidden" name="owner" value={sp.owner} />}
        {sp.owner && <span className="pill bg-brand-100 text-brand-700">Owner: {l.user(sp.owner)}</span>}
        {(q || sp.owner) && <Link href={base} className="btn-ghost !px-2 !py-1 text-xs">Clear</Link>}
        <span className="ml-auto text-xs text-ink-500">{rows.length} shown</span>
      </form>
      {rows.length === 0 ? <EmptyState title={q ? "No contact matches" : "No contacts yet"} action={<Link href="/clients/contacts/new" className="btn-primary">New contact</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[940px]">
            <Cols widths={[undefined, 210, 150, 56, undefined, 180]} />
            <thead><tr><th>Name</th><th>Email</th><th>Phone / WhatsApp</th><th className="text-center">Nat.</th><th>Companies</th><th>Tags</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const name = fullName(c) || "(no name)";
                const companies = c.companyIds.map((id) => ({ id, name: l.company(id) }));
                const sub = [c.source, c.ownerUserId ? l.user(c.ownerUserId) : undefined].filter(Boolean).join(" · ");
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/contacts/${c.id}`} className="cell-primary" title={name}>{name}</Link>
                      {sub && <span className="cell-sub" title={sub}>{c.source}{c.source && c.ownerUserId && " · "}{c.ownerUserId && <Link href={withParams(base, sp, { owner: c.ownerUserId })} className="hover:underline" title="Show this owner's contacts">{l.user(c.ownerUserId)}</Link>}</span>}
                    </td>
                    <td>{c.email ? <a href={`mailto:${c.email}`} className="cell text-xs hover:text-brand-700 hover:underline" title={c.email}>{c.email}</a> : <Dash />}</td>
                    <td className="whitespace-nowrap text-xs">
                      {c.phone ?? (c.whatsapp ? "" : <Dash />)}
                      {c.whatsapp && c.whatsapp !== c.phone && <span className="cell-sub">WA {c.whatsapp}</span>}
                    </td>
                    <td className="text-center text-xs font-medium text-ink-700">{c.nationality ?? <Dash />}</td>
                    <td>{companies.length === 0 ? <Dash /> : (
                      <span className="cell text-xs" title={companies.map((co) => co.name).join(", ")}>
                        <Link href={`/clients/companies/${companies[0].id}`} className="hover:text-brand-700 hover:underline">{companies[0].name}</Link>
                        {companies.length > 1 && <span className="text-ink-500"> +{companies.length - 1}</span>}
                      </span>
                    )}</td>
                    <td><TagList tags={c.tags} /></td>
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
