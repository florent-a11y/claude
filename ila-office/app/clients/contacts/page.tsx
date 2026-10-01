import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchesSearch, phoneDigits } from "../_lib/search";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/util";
import { Page, Badge, EmptyState, withParams } from "@/components/ui";
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
  return (
    <Page title="Contacts" subtitle={`${all.length} people · investors, directors, visa holders, referrers`} actions={<Link href="/clients/contacts/new" className="btn-primary">New contact</Link>}>
      <form className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <AutoSubmitInput name="q" defaultValue={q} placeholder="Search name, email, phone, nationality, company, tag…" className="input max-w-md" />
        {sp.owner && <input type="hidden" name="owner" value={sp.owner} />}
        <button className="btn-secondary">Search</button>
        {(q || sp.owner) && <Link href="/clients/contacts" className="btn-ghost">Clear</Link>}
        <span className="ml-auto text-xs text-ink-500">{rows.length} shown</span>
      </form>
      {rows.length === 0 ? <EmptyState title={q ? "No contact matches" : "No contacts yet"} action={<Link href="/clients/contacts/new" className="btn-primary">New contact</Link>} /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Name</th><th>Email</th><th>Phone / WhatsApp</th><th>Nat.</th><th>Companies</th><th>Owner</th><th>Tags</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="pl-4 font-medium"><Link href={`/clients/contacts/${c.id}`} className="hover:underline">{fullName(c) || "(no name)"}</Link>{c.source && <span className="block text-xs font-normal text-ink-500">{c.source}</span>}</td>
                  <td className="text-xs">{c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : "—"}</td>
                  <td className="whitespace-nowrap text-xs">{c.phone ?? "—"}{c.whatsapp && c.whatsapp !== c.phone && <span className="block text-ink-500">WA {c.whatsapp}</span>}</td>
                  <td className="text-xs">{c.nationality ?? "—"}</td>
                  <td className="text-xs">{c.companyIds.length === 0 ? "—" : c.companyIds.map((id, i) => <span key={id}>{i > 0 && ", "}<Link href={`/clients/companies/${id}`} className="hover:underline">{l.company(id)}</Link></span>)}</td>
                  <td className="text-xs"><Link href={withParams("/clients/contacts", sp, { owner: c.ownerUserId })} className="hover:underline">{l.user(c.ownerUserId)}</Link></td>
                  <td className="space-x-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(c.createdAt.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
