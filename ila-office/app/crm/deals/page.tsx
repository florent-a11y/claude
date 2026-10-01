import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { dealAgeDays, matchesSearch, pipelineStats } from "@/lib/crm";
import { fmtDate, nowISO, addDays, todayISO } from "@/lib/dates";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_PROBABILITY, SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type Deal } from "@/lib/types";
import { Page, Card, Stat, Badge, Chips, Money, EmptyState, statusTone, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { fmtAmounts, lookups } from "../_lib/server";
import { StageMover } from "./StageMover";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals" };

type SP = { view?: string; stage?: string; owner?: string; category?: string; q?: string; all?: string };

export default async function Deals({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [l, all] = await Promise.all([lookups(), db.list("deals", { orderBy: "createdAt", desc: true })]);
  const write = can(me, "crm:write");
  const now = nowISO();
  const year = Number(todayISO().slice(0, 4));
  const stats = pipelineStats(all, { year });
  const base = "/crm/deals";
  const filtered = all.filter((d) => (!sp.owner || d.ownerUserId === sp.owner) && (!sp.category || d.category === sp.category) && matchesSearch([d.title, l.company(d.companyId), l.contact(d.contactId), d.nextStep], sp.q));
  const isList = sp.view === "list";
  const cutoff = addDays(todayISO(), -90);
  const onBoard = (d: Deal) => sp.all === "1" || !d.closedAt || d.closedAt.slice(0, 10) >= cutoff;
  const list = sp.stage ? filtered.filter((d) => d.stage === sp.stage) : filtered;

  return (
    <Page title="Deals" subtitle="Prospect 20% → Qualified 40% → Quotation sent 60% → Review 80% → Invoice sent 90% → Closed"
      actions={<>
        <Link href={withParams(base, sp, { view: isList ? undefined : "list" })} className="btn-secondary">{isList ? "Board view" : "List view"}</Link>
        {write && <Link href="/crm/deals/new" className="btn-primary">New deal</Link>}
      </>}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open deals" value={stats.open.count} />
        <Stat label="Open pipeline" value={<span className="text-lg">{fmtAmounts(stats.open.amount)}</span>} />
        <Stat label="Weighted pipeline" value={<span className="text-lg">{fmtAmounts(stats.open.weighted)}</span>} hint="amount × stage probability" />
        <Stat label={`Won in ${year}`} value={<span className="text-lg">{fmtAmounts(stats.wonThisYear.amount)}</span>} hint={`${stats.wonThisYear.count} deals`} />
      </div>
      <div className="mb-3 space-y-2 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <Chips items={[{ href: withParams(base, sp, { owner: undefined }), label: "Everyone", active: !sp.owner }, { href: withParams(base, sp, { owner: me.id }), label: "Mine", active: sp.owner === me.id }, ...l.activeUsers.filter((u) => u.id !== me.id).map((u) => ({ href: withParams(base, sp, { owner: u.id }), label: u.name.split(" ")[0], active: sp.owner === u.id }))]} />
          <form className="flex items-center gap-2">
            {Object.entries(sp).filter(([k, v]) => k !== "q" && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <AutoSubmitInput name="q" defaultValue={sp.q} placeholder="Search deals…" className="input !w-56 !py-1.5" />
          </form>
        </div>
        <Chips items={[{ href: withParams(base, sp, { category: undefined }), label: "All categories", active: !sp.category }, ...SERVICE_CATEGORIES.map((c) => ({ href: withParams(base, sp, { category: c }), label: SERVICE_CATEGORY_LABELS[c].split(" ")[0], active: sp.category === c }))]} />
        {isList && <Chips items={[{ href: withParams(base, sp, { stage: undefined }), label: "All stages", active: !sp.stage }, ...DEAL_STAGES.map((s) => ({ href: withParams(base, sp, { stage: s }), label: `${DEAL_STAGE_LABELS[s]} (${stats.stages[s].count})`, active: sp.stage === s }))]} />}
      </div>

      {all.length === 0 ? <EmptyState title="No deals yet" hint="Every enquiry becomes a deal at Prospect; move it along as you qualify, quote and invoice." action={write && <Link href="/crm/deals/new" className="btn-primary">New deal</Link>} /> : isList ? (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Deal</th><th>Company / contact</th><th>Stage</th><th className="num">Amount</th><th className="num">Weighted</th><th>Owner</th><th>Category</th><th>Age</th><th>Expected close</th><th>Next step</th></tr></thead>
            <tbody>{list.map((d) => (
              <tr key={d.id}>
                <td className="pl-4 font-medium"><Link href={`/crm/deals/${d.id}`} className="hover:underline">{d.title}</Link></td>
                <td className="text-xs">{d.companyId && <Link href={`/crm/companies/${d.companyId}`} className="hover:underline">{l.company(d.companyId)}</Link>}{d.companyId && d.contactId && <br />}{d.contactId && <Link href={`/crm/contacts/${d.contactId}`} className="hover:underline">{l.contact(d.contactId)}</Link>}</td>
                <td><Badge tone={statusTone(d.stage)}>{DEAL_STAGE_LABELS[d.stage]}</Badge></td>
                <td className="num"><Money amount={d.amount} currency={d.currency} /></td>
                <td className="num text-xs"><Money amount={d.amount * DEAL_STAGE_PROBABILITY[d.stage]} currency={d.currency} /></td>
                <td className="text-xs">{l.user(d.ownerUserId)}</td>
                <td className="text-xs">{d.category ? SERVICE_CATEGORY_LABELS[d.category].split(" ")[0] : "—"}</td>
                <td className="text-xs tabular-nums">{dealAgeDays(d, now)} d</td>
                <td className="text-xs">{fmtDate(d.expectedCloseDate)}</td>
                <td className="max-w-xs truncate text-xs">{d.lostReason ? <span className="text-red-700">{d.lostReason}</span> : d.nextStep ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {list.length === 0 && <p className="p-4 text-sm text-ink-500">No deal matches these filters.</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-flow-col auto-cols-[minmax(15rem,1fr)] gap-3 overflow-x-auto pb-3">
            {DEAL_STAGES.map((stage) => {
              const cards = filtered.filter((d) => d.stage === stage && onBoard(d));
              const st = pipelineStats(cards).stages[stage];
              return (
                <div key={stage} className="flex min-h-[12rem] flex-col rounded-xl bg-slate-100/80 p-2">
                  <div className="mb-2 px-1">
                    <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-ink-700">{DEAL_STAGE_LABELS[stage]}</span><Badge tone={statusTone(stage)}>{cards.length}</Badge></div>
                    <p className="text-[11px] text-ink-500">{Math.round(DEAL_STAGE_PROBABILITY[stage] * 100)}% · {fmtAmounts(st.amount, "no value")}</p>
                  </div>
                  <div className="space-y-2">
                    {cards.map((d) => (
                      <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-sm">
                        <Link href={`/crm/deals/${d.id}`} className="block font-medium leading-tight hover:underline">{d.title}</Link>
                        <p className="mt-0.5 truncate text-xs text-ink-500">{d.companyId ? l.company(d.companyId) : l.contact(d.contactId)}</p>
                        <div className="mt-1 flex items-center justify-between text-xs"><Money amount={d.amount} currency={d.currency} className="font-semibold" /><span className="text-ink-500">{dealAgeDays(d, now)} d</span></div>
                        <div className="mt-1 flex items-center justify-between gap-1 text-xs text-ink-500"><span className="truncate">{l.user(d.ownerUserId)}</span>{d.category && <span className="truncate">{SERVICE_CATEGORY_LABELS[d.category].split(" ")[0]}</span>}</div>
                        {d.nextStep && <p className="mt-1 truncate text-xs text-brand-700" title={d.nextStep}>→ {d.nextStep}</p>}
                        {write && <div className="mt-1.5 border-t border-slate-100 pt-1.5"><StageMover id={d.id} stage={d.stage} /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-500">Closed deals older than 90 days are hidden from the board. <Link className="underline" href={withParams(base, sp, { all: sp.all === "1" ? undefined : "1" })}>{sp.all === "1" ? "Hide them" : "Show all"}</Link> or use the list view.</p>
        </>
      )}
      {!isList && all.length > 0 && (
        <Card title="Stage totals" className="mt-4 overflow-x-auto">
          <table className="table"><thead><tr><th>Stage</th><th className="num">Deals</th><th className="num">Amount</th><th className="num">Weighted</th></tr></thead>
            <tbody>{DEAL_STAGES.map((s) => <tr key={s}><td>{DEAL_STAGE_LABELS[s]}</td><td className="num">{stats.stages[s].count}</td><td className="num">{fmtAmounts(stats.stages[s].amount)}</td><td className="num">{fmtAmounts(stats.stages[s].weighted)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </Page>
  );
}
