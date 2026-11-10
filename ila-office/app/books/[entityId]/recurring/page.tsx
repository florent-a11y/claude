import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { occurrencesDue, payloadOf, templateSummary } from "@/lib/recurring";
import { listTemplates } from "@/lib/recurring-services";
import { Badge, Cols, Dash, EmptyState, Notice, TableCard } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { KindBadge, StatusBadge, occurrencesLabel, repeatsLabel, runHref } from "./shared";
import { deleteTemplateAction, runDueAction, runTemplateAction, setStatusAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Recurring transactions of one entity: what repeats, when the next document falls, what the last run produced.
 * Templates are made from an existing document ("Make recurring" on invoices, bills, expenses, deposits and manual
 * journals); the daily cron creates every due occurrence, "Run due now" does the same on demand.
 */
export default async function RecurringPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const [templates, banks] = await Promise.all([listTemplates(entityId), db.list("bank_accounts", { where: { entityId } })]);
  const today = todayISO();
  const write = can(user, "books:write");
  const b = base(entityId);
  const here = `${b}/recurring`;
  const bankCurrency = (t: (typeof templates)[number]) => (t.kind === "expense" || t.kind === "deposit" ? banks.find((x) => x.id === payloadOf({ kind: "expense", payload: t.payload }).bankAccountId)?.currency : undefined);
  const due = templates.filter((t) => t.status === "active" && t.nextDate <= today);
  const dueCount = due.reduce((s, t) => s + occurrencesDue(t, today).length, 0);
  const failed = templates.filter((t) => t.runs.length && t.runs[t.runs.length - 1].error).length;
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Recurring transactions</h2>
          <p className="max-w-3xl text-sm text-ink-500">Rent, retainers, subscriptions, bank fees, monthly accruals: a document repeated every week, month, quarter, six months or year. Due documents are created automatically every morning (08:00 WIB), dated the occurrence day; a document that cannot be made (locked period, closed account) is recorded here with the reason and the next occurrence still comes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {write && due.length > 0 && (
            <ConfirmForm action={runDueAction.bind(null, entityId)} message={`Create ${occurrencesLabel(due.flatMap((t) => occurrencesDue(t, today)))} now, across ${due.length} recurring transaction${due.length === 1 ? "" : "s"}?`}>
              <button className="btn-primary" type="submit">Run due now ({dueCount})</button>
            </ConfirmForm>
          )}
          {write && <Link href={`${here}/new`} className="btn-secondary">Make recurring…</Link>}
        </div>
      </div>
      {failed > 0 && <Notice tone="red">{failed} recurring transaction{failed === 1 ? "" : "s"} failed on the last run: see the reason in red below, fix the cause (unlock the period, reactivate the account, check the bank account) and run due now again, or edit the next date to skip the occurrence.</Notice>}
      {templates.length === 0 ? (
        <EmptyState
          title="No recurring transaction yet"
          hint={<>Open any invoice, bill, expense, deposit or manual journal entry and click <strong>Make recurring</strong>: the document becomes a template, dated anew on each occurrence, with the frequency, start and end dates you choose.</>}
          action={<div className="flex flex-wrap justify-center gap-2"><Link href={`${b}/sales`} className="btn-secondary">Sales</Link><Link href={`${b}/purchases`} className="btn-secondary">Purchases</Link><Link href={`${b}/expenses`} className="btn-secondary">Expenses</Link><Link href={`${b}/deposits`} className="btn-secondary">Deposits</Link><Link href={`${b}/journal`} className="btn-secondary">Journal</Link></div>}
        />
      ) : (
        <TableCard footer={<>{templates.length} recurring transaction{templates.length === 1 ? "" : "s"} · {due.length} due · the cron runs daily; “run now” creates every occurrence up to today for one template.</>}>
          <table className="table table-data min-w-[1180px]">
            <Cols widths={[undefined, 90, 190, 150, 118, 230, 84, write ? 190 : 24]} />
            <thead><tr><th>Name</th><th>Kind</th><th>Repeats</th><th className="num">Amount</th><th>Next date</th><th>Last run</th><th>Status</th><th className="no-print"></th></tr></thead>
            <tbody>
              {templates.map((t) => {
                const s = templateSummary(t, bankCurrency(t));
                const last = t.runs.length ? t.runs[t.runs.length - 1] : undefined;
                const lastHref = last ? runHref(b, t.kind, last) : undefined;
                const pending = t.status === "active" ? occurrencesDue(t, today).length : 0;
                const detail = `${here}/${t.id}`;
                return (
                  <tr key={t.id} className={t.status === "active" ? "" : "row-muted"}>
                    <td>
                      <Link href={detail} className={t.status === "active" ? "cell-primary" : "cell font-medium"} title={t.name}>{t.name}</Link>
                      {s.party && <span className="cell-sub" title={s.party}>{s.party}</span>}
                    </td>
                    <td><KindBadge kind={t.kind} /></td>
                    <td>
                      <span className="cell" title={repeatsLabel(t)}>{repeatsLabel(t)}</span>
                      <span className="cell-sub">{t.endDate ? `until ${fmtDate(t.endDate)}` : `since ${fmtDate(t.startDate)}`}{(t.kind === "invoice" || t.kind === "bill") && !t.autoPost ? " · as draft" : ""}</span>
                    </td>
                    <td className="num"><span className="money">{fmtMoney(s.amount, s.currency || "IDR")}</span>{s.lines.length > 1 && <span className="cell-sub">{s.lines.length} lines</span>}</td>
                    <td className="whitespace-nowrap">
                      {t.status === "ended" ? <Dash /> : <span className={pending ? "font-medium text-amber-800" : ""}>{fmtDate(t.nextDate)}</span>}
                      {pending > 0 && <span className="cell-sub"><Badge tone="amber">{pending} due</Badge></span>}
                    </td>
                    <td>
                      {!last ? <span className="text-xs text-ink-500">never</span> : last.error ? (
                        <><span className="cell text-xs text-red-700" title={`${fmtDate(last.date)}: ${last.error}`}>{fmtDate(last.date)} · {last.error}</span>{lastHref && <Link href={lastHref} className="cell-sub text-brand-600 underline">{last.number}</Link>}</>
                      ) : (
                        <>{lastHref ? <Link href={lastHref} className="cell font-medium" title={last.number}>{last.number ?? "document"}</Link> : <span className="cell">{last.number ?? "created"}</span>}<span className="cell-sub" title={fmtDateTime(last.at)}>dated {fmtDate(last.date)} · {t.runs.length} run{t.runs.length === 1 ? "" : "s"}</span></>
                      )}
                    </td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="no-print whitespace-nowrap text-right text-xs">
                      {write && (
                        <>
                          {pending > 0 && <><ConfirmForm action={runTemplateAction.bind(null, entityId, t.id, here)} message={`Create ${occurrencesLabel(occurrencesDue(t, today))} of “${t.name}” now?`}><button className="text-brand-600 underline" type="submit">run now</button></ConfirmForm> · </>}
                          {t.status === "active" && <><ConfirmForm action={setStatusAction.bind(null, entityId, t.id, "paused", here)} message={`Pause “${t.name}”? Nothing is created until it is resumed; occurrences falling while paused are created on resume unless you move the next date.`}><button className="text-brand-600 underline" type="submit">pause</button></ConfirmForm> · </>}
                          {t.status === "paused" && <><ConfirmForm action={setStatusAction.bind(null, entityId, t.id, "active", here)} message={`Resume “${t.name}”? Its next date is ${fmtDate(t.nextDate)}${t.nextDate <= today ? `: ${occurrencesLabel(occurrencesDue(t, today))} will be created on the next run` : ""}.`}><button className="text-brand-600 underline" type="submit">resume</button></ConfirmForm> · </>}
                          <Link href={detail} className="text-brand-600 underline">edit</Link> ·{" "}
                          <ConfirmForm action={deleteTemplateAction.bind(null, entityId, t.id)} message={`Delete “${t.name}”? The documents it already created stay in the books.`}><button className="text-red-600 underline" type="submit">delete</button></ConfirmForm>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
