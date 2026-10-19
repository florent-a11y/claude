import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextPeriod, periodLabel, prevPeriod, todayISO, fmtDate } from "@/lib/dates";
import { OBLIGATION_LABELS, OBLIGATION_STATUSES, OBLIGATION_STATUS_LABELS, OBLIGATION_TYPES, type ObligationType } from "@/lib/types";
import { groupBy } from "@/lib/util";
import { dueMonth, isOverdue } from "@/lib/tax/calendar";
import { Page, Stat, Select, Chips, Cols, Dash, TableCard, withParams, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ObligationCell } from "./ObligationCell";
import { generateAllObligations } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compliance calendar" };

const SHORT: Record<ObligationType, string> = {
  bookkeeping: "Books", pph21: "PPh 21", pph23: "PPh 23", pph26: "PPh 26", pph4_2: "PPh 4(2)", pph25: "PPh 25", ppn: "PPN", local_tax: "PB1", bpjs: "BPJS", payroll: "Payroll",
  lkpm: "LKPM", spt_badan: "SPT Badan", spt_op: "SPT OP", gms: "RUPS", annual_report: "Annual", pph_final_umkm: "PPh 0.5%", other: "Other",
};

export default async function AllClientsCalendar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const mode = sp.mode === "period" ? "period" : "due";
  const [entities, users, all] = await Promise.all([
    db.list("entities", { where: { status: "active" }, orderBy: "name" }),
    db.list("users", { where: { active: true }, orderBy: "name" }),
    db.list("tax_obligations"),
  ]);
  const inMonth = all.filter((o) => (mode === "period" ? (o.period.length === 7 ? o.period === month : dueMonth(o) === month) : dueMonth(o) === month));
  const filtered = inMonth.filter((o) => (!sp.status || o.status === sp.status) && (!sp.assignee || (sp.assignee === "none" ? !o.assigneeUserId : o.assigneeUserId === sp.assignee)));
  const types = OBLIGATION_TYPES.filter((t) => filtered.some((o) => o.type === t));
  const byEntity = groupBy(filtered, (o) => o.entityId);
  const entityRows = entities.filter((e) => !sp.status && !sp.assignee ? true : byEntity.has(e.id));
  const counts = { total: inMonth.length, open: 0, inProgress: 0, done: 0, overdue: 0 };
  for (const o of inMonth) {
    if (o.status === "not_started" || o.status === "late") counts.open++;
    else if (o.status === "paid" || o.status === "reported" || o.status === "nil") counts.done++;
    else counts.inProgress++;
    if (isOverdue(o, today)) counts.overdue++;
  }
  const canWrite = can(user, "tax:write");
  const cellUsers = users.map((u) => ({ id: u.id, name: u.name }));
  const current = { month, mode: sp.mode, status: sp.status, assignee: sp.assignee };
  const year = Number(month.slice(0, 4));
  /** Cell line "Sept · due 20 Oct": the period and the due date drop the year when it is the calendar's own year (the tooltip keeps everything). */
  const yearStr = String(year);
  const hintOf = (o: (typeof all)[number]) => {
    const period = periodLabel(o.period), due = fmtDate(o.reportDue);
    return `${o.period.length > 4 && o.period.startsWith(yearStr) ? period.replace(/\s\d{4}$/, "") : period} · due ${o.reportDue.startsWith(yearStr) ? due.replace(/\s\d{4}$/, "") : due}`;
  };
  const titleOf = (o: (typeof all)[number]) => `${periodLabel(o.period)} · due ${fmtDate(o.reportDue)}${o.amount ? ` · ${o.amount.toLocaleString("en-US")}` : ""}`;

  return (
    <Page
      title="Compliance calendar — all clients"
      subtitle={mode === "due" ? `Everything due in ${periodLabel(month)} (tax periods of the previous month, quarterly and annual filings falling due).` : `Obligations for the tax period ${periodLabel(month)}.`}
      actions={canWrite && (
        <form action={generateAllObligations} className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <input name="year" type="number" defaultValue={year} className="input !w-24" aria-label="Year" />
          <SubmitButton className="btn-secondary" pendingText="Generating…">Generate missing obligations</SubmitButton>
        </form>
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 no-print">
        <Link href={withParams("/tax", current, { month: prevPeriod(month) })} className="btn-secondary !px-3">‹</Link>
        <form method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={month} className="input !w-44" />
          {sp.mode && <input type="hidden" name="mode" value={sp.mode} />}
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.assignee && <input type="hidden" name="assignee" value={sp.assignee} />}
          <button className="btn-secondary">Go</button>
        </form>
        <Link href={withParams("/tax", current, { month: nextPeriod(month) })} className="btn-secondary !px-3">›</Link>
        <Chips items={[{ href: withParams("/tax", current, { mode: undefined }), label: "Due this month", active: mode === "due" }, { href: withParams("/tax", current, { mode: "period" }), label: "By tax period", active: mode === "period" }]} />
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          {sp.mode && <input type="hidden" name="mode" value={sp.mode} />}
          <Select name="status" defaultValue={sp.status ?? ""} className="input !w-48 !py-1 text-xs" options={[{ value: "", label: "All statuses" }, ...OBLIGATION_STATUSES.map((s) => ({ value: s, label: OBLIGATION_STATUS_LABELS[s] }))]} />
          <Select name="assignee" defaultValue={sp.assignee ?? ""} className="input !w-44 !py-1 text-xs" options={[{ value: "", label: "All assignees" }, { value: "none", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
          <button className="btn-secondary !py-1 text-xs">Filter</button>
        </form>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <Stat label="Obligations" value={counts.total} hint={`${entities.length} active entities`} />
        <Stat label="Not started" value={counts.open} />
        <Stat label="In progress" value={counts.inProgress} tone="text-blue-700" />
        <Stat label="Done" value={counts.done} tone="text-green-700" />
        <Stat label="Overdue" value={counts.overdue} tone={counts.overdue ? "text-red-700" : ""} />
      </div>

      {inMonth.length === 0 ? (
        <EmptyState title={`No obligations for ${periodLabel(month)}`} hint={canWrite ? "Generate the calendar for the year with the button above; it follows each entity's tax profile (PKP, payroll, LKPM, regime…)." : "Ask an accountant or admin to generate the calendar."} />
      ) : (
        <TableCard>
          <table className="table table-data" style={{ minWidth: 210 + 150 * types.length }}>
            <Cols widths={[210, ...types.map(() => 150)]} />
            <thead>
              <tr>
                <th className="sticky left-0 bg-white">Client</th>
                {types.map((t) => <th key={t} title={OBLIGATION_LABELS[t]}>{SHORT[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {entityRows.map((e) => {
                const rows = byEntity.get(e.id) ?? [];
                const meta = [e.region ?? e.country, e.tax.pkp ? "PKP" : "non-PKP", e.tax.payroll ? "payroll" : undefined].filter(Boolean).join(" · ");
                return (
                  <tr key={e.id}>
                    <td className="sticky left-0 bg-white !align-top">
                      <Link href={`/tax/${e.id}?year=${year}`} className="cell-primary" title={e.name}>{e.isOwn && <span className="mr-1 text-accent-600">★</span>}{e.name}</Link>
                      <span className="cell-sub" title={meta}>{meta}</span>
                    </td>
                    {types.map((t) => {
                      const cells = rows.filter((o) => o.type === t).sort((a, b) => a.period.localeCompare(b.period));
                      return (
                        <td key={t} className="!align-top">
                          {cells.length === 0 ? <Dash /> : (
                            <div className="space-y-1.5">
                              {cells.map((o) => (
                                <ObligationCell key={o.id} id={o.id} status={o.status} assigneeUserId={o.assigneeUserId} users={cellUsers} canWrite={canWrite} overdue={isOverdue(o, today)} hint={hintOf(o)} title={titleOf(o)}>
                                  {o.amount ? <span className="tabular-nums">{o.amount.toLocaleString("en-US")}</span> : null}
                                </ObligationCell>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
      <p className="mt-3 text-xs text-ink-500">Cells change status and assignee in place. A red outline means the report due date has passed. Open a client to edit amounts, NTPN and notes.</p>
    </Page>
  );
}
