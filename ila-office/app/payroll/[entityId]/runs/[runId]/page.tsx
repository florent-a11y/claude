import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, periodLabel } from "@/lib/dates";
import { Card, Badge, Notice, DL } from "@/components/ui";
import { ConfirmForm, SubmitButton, Flash } from "@/components/client";
import { PayslipTable } from "../PayslipTable";
import { approveRunAction, deleteRunAction, markPaidAction, recalculateRunAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function RunDetail({ params, searchParams }: { params: Promise<{ entityId: string; runId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { entityId, runId } = await params;
  const sp = await searchParams;
  const run = await db.get("payroll_runs", runId);
  if (!run || run.entityId !== entityId) notFound();
  const canWrite = can(user, "tax:write");
  const journal = run.journalId ? await db.get("journal_entries", run.journalId) : null;
  const approver = run.approvedByUserId ? await db.get("users", run.approvedByUserId) : null;
  const tone = run.status === "paid" ? "green" : run.status === "approved" ? "blue" : "slate";
  const overrides = Object.fromEntries(run.lines.map((l) => [l.employeeId, { overtime: l.overtime, bonus: l.bonus, notes: l.notes }]));
  return (
    <div className="space-y-4 pb-8">
      <Flash message={sp.approved ? "Run approved and journal posted." : sp.paid ? "Run marked as paid." : sp.saved ? "Run recalculated." : undefined} />
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2"><Link href={`/payroll/${entityId}`} className="btn-ghost">‹ Runs</Link><h2 className="text-lg font-semibold">Payroll {periodLabel(run.period)}</h2><Badge tone={tone}>{run.status}</Badge></div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {run.status === "draft" && <ConfirmForm action={approveRunAction.bind(null, run.id)} message={`Approve payroll ${run.period} and post the journal? Lines can no longer be edited.`}><button className="btn-primary">Approve & post journal</button></ConfirmForm>}
            {run.status === "approved" && <ConfirmForm action={markPaidAction.bind(null, run.id)} message="Mark salaries as paid?"><button className="btn-primary">Mark paid</button></ConfirmForm>}
            {run.status === "draft" && <ConfirmForm action={deleteRunAction.bind(null, run.id)} message="Delete this draft run?"><button className="btn-danger">Delete draft</button></ConfirmForm>}
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Run"><DL items={[["Period", periodLabel(run.period)], ["Pay date", fmtDate(run.payDate)], ["Employees", run.lines.length], ["Created", fmtDateTime(run.createdAt)], ["Approved", run.approvedAt ? `${fmtDateTime(run.approvedAt)}${approver ? ` by ${approver.name}` : ""}` : "—"], ["Paid", run.paidAt ? fmtDateTime(run.paidAt) : "—"]]} /></Card>
        <Card title="Journal">{journal ? <DL items={[["Entry", <Link key="j" className="underline" href={`/books/${entityId}/journal/${journal.id}`}>{journal.number}</Link>], ["Date", fmtDate(journal.date)], ["Memo", journal.memo], ["Lines", journal.lines.length]]} /> : <p className="text-sm text-ink-500">Posted on approval: Dr salaries (gross) and BPJS employer expense; Cr PPh 21 payable, BPJS payable, employee deductions, salaries payable (net).</p>}</Card>
        <Card title="Next steps"><ul className="list-disc space-y-1 pl-4 text-sm"><li>Client approval 26th–28th, salaries paid on the 1st.</li><li>PPh 21 {run.totals.pph21.toLocaleString("en-US")}: pay by the 10th, report (SPT Masa 21/26) by the 20th.</li><li>BPJS {(run.totals.employerBpjs + run.totals.employeeBpjs).toLocaleString("en-US")}: pay by the 15th.</li><li><Link className="underline" href={`/tax/${entityId}?year=${run.period.slice(0, 4)}`}>Update the compliance calendar</Link></li></ul></Card>
      </div>
      {run.status === "draft" && canWrite ? (
        <form action={recalculateRunAction.bind(null, run.id)}>
          <Card title="Payslips (draft: edit overtime, bonus and notes, then recalculate)" actions={<label className="flex items-center gap-2 text-xs">Pay date <input type="date" name="payDate" defaultValue={run.payDate} className="input !w-40 !py-1" /></label>}>
            <PayslipTable lines={run.lines} totals={run.totals} editable overrides={overrides} entityId={entityId} runId={run.id} />
            <div className="mt-3 no-print"><SubmitButton className="btn-secondary" pendingText="Recalculating…">Recalculate & save</SubmitButton></div>
          </Card>
        </form>
      ) : (
        <Card title="Payslips"><PayslipTable lines={run.lines} totals={run.totals} entityId={entityId} runId={run.id} /></Card>
      )}
      {run.lines.some((l) => l.pph21.amount < 0) && <Notice tone="amber">At least one employee has a negative PPh 21 (annual tax below the TER amounts withheld): the difference is refunded through net pay and reduces the PPh 21 payable.</Notice>}
    </div>
  );
}
