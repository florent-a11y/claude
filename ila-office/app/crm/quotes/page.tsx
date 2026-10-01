import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveQuoteStatus, matchesSearch } from "@/lib/crm";
import { todayISO } from "@/lib/dates";
import { Page, Chips, EmptyState, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { lookups } from "../_lib/server";
import { QuotesTable } from "../_components/tables";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotes" };
const STATUSES = ["draft", "sent", "expired", "accepted", "declined"] as const;

export default async function Quotes({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; owner?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [l, all] = await Promise.all([lookups(), db.list("quotes", { orderBy: "createdAt", desc: true })]);
  const today = todayISO();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((q) => effectiveQuoteStatus(q, today) === s).length]));
  const rows = all.filter((q) => (!sp.status || effectiveQuoteStatus(q, today) === sp.status) && (!sp.owner || q.preparedByUserId === sp.owner) && matchesSearch([q.number, q.title, l.company(q.companyId), l.contact(q.contactId)], sp.q));
  const base = "/crm/quotes";
  return (
    <Page title="Quotes" subtitle="Valid 7 days, all services paid in advance. Mark sent when the PDF goes out; accept to move the deal to Review." actions={can(me, "crm:write") && <Link href="/crm/quotes/new" className="btn-primary">New quote</Link>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <Chips items={[{ href: withParams(base, sp, { status: undefined }), label: `All (${all.length})`, active: !sp.status }, ...STATUSES.map((s) => ({ href: withParams(base, sp, { status: s }), label: `${s} (${counts[s]})`, active: sp.status === s }))]} />
        <form className="flex items-center gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <AutoSubmitInput name="q" defaultValue={sp.q} placeholder="Search number, title, client…" className="input !w-64 !py-1.5" />
        </form>
        <Link href={withParams(base, sp, { owner: sp.owner ? undefined : me.id })} className="text-xs text-brand-600 underline">{sp.owner ? "All preparers" : "Only mine"}</Link>
      </div>
      {rows.length === 0 ? <EmptyState title="No quotes" action={can(me, "crm:write") && <Link href="/crm/quotes/new" className="btn-primary">New quote</Link>} /> : <div className="card !p-3"><QuotesTable quotes={rows} l={l} /></div>}
    </Page>
  );
}
