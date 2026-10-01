import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { fiscalYearPeriods, fiscalYearStartOf, profitAndLoss } from "@/lib/ledger";
import { entityEntries, entityAccounts } from "@/lib/books";
import { todayISO, periodLabel, lastDayOfMonth, fmtDateTime } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, Field, Notice } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { lockPeriodAction, lockThroughAction, closeYearAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Periods({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const today = todayISO();
  const currentFyStart = fiscalYearStartOf(today, entity.fiscalYearStartMonth);
  const year = first(sp.year) ?? currentFyStart.slice(0, 4);
  const fyStart = `${year}-${String(entity.fiscalYearStartMonth).padStart(2, "0")}-01`;
  const periods = fiscalYearPeriods(fyStart, entity.fiscalYearStartMonth);
  const fyEnd = lastDayOfMonth(periods[11]);
  const [locks, entries, accounts, users] = await Promise.all([db.list("periods", { where: { entityId } }), entityEntries(entityId), entityAccounts(entityId), db.list("users")]);
  const lockById = new Map(locks.map((l) => [l.period, l]));
  const userName = (id?: string) => users.find((u) => u.id === id)?.name ?? "";
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.period, (counts.get(e.period) ?? 0) + 1);
  const writable = can(user, "books:write");
  const b = base(entityId);
  const years = [...new Set([...entries.map((e) => fiscalYearStartOf(e.date, entity.fiscalYearStartMonth).slice(0, 4)), currentFyStart.slice(0, 4), year])].sort().reverse();
  const pl = profitAndLoss(accounts, entries, { from: fyStart, to: fyEnd });
  const closed = entries.some((e) => e.source === "closing" && e.date === fyEnd);
  const allLocked = periods.every((p) => lockById.get(p)?.locked);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex items-center gap-2"><label className="text-sm">Fiscal year</label><select name="year" defaultValue={year} className="input !w-auto !py-1">{years.map((y) => <option key={y} value={y}>{entity.fiscalYearStartMonth === 1 ? y : `${y}/${Number(y) + 1}`}</option>)}</select><button className="btn-secondary !py-1 text-xs">Show</button></form>
        {writable && (
          <form action={lockThroughAction.bind(null, entityId, entity.fiscalYearStartMonth)} className="flex items-end gap-2">
            <input type="hidden" name="year" value={year} />
            <Field label="Lock all months through"><input name="through" type="month" defaultValue={periods.find((p) => p <= today.slice(0, 7) && !lockById.get(p)?.locked) ?? periods[0]} className="input !py-1" /></Field>
            <SubmitButton className="btn-secondary">Lock through</SubmitButton>
          </form>
        )}
      </div>
      <Card className="overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4">Period</th><th className="num">Posted entries</th><th>Status</th><th>Locked by</th><th className="no-print"></th></tr></thead>
          <tbody>
            {periods.map((p) => {
              const l = lockById.get(p);
              const future = p > today.slice(0, 7);
              return (
                <tr key={p} className={future ? "text-ink-500" : ""}>
                  <td className="pl-4 font-medium">{periodLabel(p)} <span className="text-xs text-ink-500">{p}</span></td>
                  <td className="num"><Link href={`${b}/journal?period=${p}`} className="hover:underline">{counts.get(p) ?? 0}</Link></td>
                  <td>{l?.locked ? <Badge tone="green">locked</Badge> : <Badge tone={future ? "slate" : "amber"}>{future ? "future" : "open"}</Badge>}</td>
                  <td className="text-xs text-ink-500">{l?.locked ? `${userName(l.lockedByUserId)} · ${fmtDateTime(l.lockedAt)}` : ""}</td>
                  <td className="no-print text-xs">{writable && (l?.locked ? <ConfirmForm action={lockPeriodAction.bind(null, entityId, p, false, year)} message={`Unlock ${p}? Entries can then be posted or voided in this month again.`}><button className="text-brand-600 underline" type="submit">unlock</button></ConfirmForm> : <form action={lockPeriodAction.bind(null, entityId, p, true, year)} className="inline"><button className="text-brand-600 underline" type="submit">lock</button></form>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Year ${year} result`}>
          <p className="text-sm">Revenue {fmtMoney(pl.revenue)} · expenses {fmtMoney(pl.cogs + pl.opex + pl.otherExpense + pl.tax)} · <strong>net profit {fmtMoney(pl.netProfit)}</strong></p>
          <p className="mt-2 text-xs text-ink-500">Locking is enforced when posting or voiding any journal (invoices, bills, bank, payroll, depreciation). Admins and accountants can lock; locked months stay visible in reports.</p>
        </Card>
        <Card title="Year-end close (optional)">
          {closed ? <Notice tone="green">A closing entry dated {fyEnd} exists: the result was moved to retained earnings.</Notice> : (
            <>
              <p className="text-sm text-ink-500">The balance sheet already shows prior-year profit in retained earnings, so closing is optional. Closing posts one entry dated {fyEnd} that zeroes every revenue and expense account against retained earnings (admin only, {allLocked ? "all months locked" : "lock the year first"}).</p>
              {can(user, "admin") && fyEnd < today && <div className="mt-3"><ConfirmForm action={closeYearAction.bind(null, entityId, fyEnd, year)} message={`Post the year-end closing entry dated ${fyEnd}? Unlock ${periods[11]} first if it is locked.`}><button className="btn-secondary" type="submit">Close year {year}</button></ConfirmForm></div>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
