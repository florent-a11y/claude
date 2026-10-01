import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { lastDayOfMonth, nextPeriod, periodLabel, todayISO } from "@/lib/dates";
import { previewRun } from "@/lib/payroll-services";
import type { LineOverride } from "@/lib/payroll";
import { Card, Notice, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createRunAction, previewRunAction } from "../../../actions";
import { PayslipTable } from "../PayslipTable";

export const dynamic = "force-dynamic";

export default async function NewRun({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("tax:write");
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : todayISO().slice(0, 7);
  const payDate = sp.payDate && /^\d{4}-\d{2}-\d{2}$/.test(sp.payDate) ? sp.payDate : `${nextPeriod(period)}-01`;
  const overrides: Record<string, LineOverride> = {};
  for (const [k, v] of Object.entries(sp)) {
    const m = k.match(/^(ot|bonus|notes)_(.+)$/);
    if (!m || !v) continue;
    const o = (overrides[m[2]] ??= {});
    if (m[1] === "ot") o.overtime = Number(v) || 0; else if (m[1] === "bonus") o.bonus = Number(v) || 0; else o.notes = v;
  }
  const existing = await db.list("payroll_runs", { where: { entityId, period } });
  const { lines, totals } = await previewRun(entityId, period, overrides);
  const isDecember = period.endsWith("-12");
  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2 no-print"><Link href={`/payroll/${entityId}`} className="btn-ghost">‹ Runs</Link><h2 className="text-lg font-semibold">New payroll run · {periodLabel(period)}</h2></div>
      {existing.length > 0 && <Notice tone="red">A run for {periodLabel(period)} already exists: <Link className="underline" href={`/payroll/${entityId}/runs/${existing[0].id}`}>open it</Link>.</Notice>}
      {isDecember && <Notice tone="blue">December: PPh 21 uses the annual progressive computation minus the TER amounts withheld in the earlier runs of the year. Make sure January–November runs exist first.</Notice>}
      {lines.length === 0 ? <EmptyState title="No active employee for this period" hint="Employees must have joined by the end of the period and not left before it." action={<Link href={`/payroll/${entityId}/employees/new`} className="btn-secondary">Add employee</Link>} /> : (
        <form action={createRunAction.bind(null, entityId)}>
          <input type="hidden" name="period" value={period} />
          <Card title="Lines (edit overtime / bonus, then recalculate)" actions={<label className="flex items-center gap-2 text-xs">Pay date <input type="date" name="payDate" defaultValue={payDate} min={`${period}-01`} max={lastDayOfMonth(nextPeriod(period))} className="input !w-40 !py-1" /></label>}>
            <PayslipTable lines={lines} totals={totals} editable overrides={overrides} entityId={entityId} />
          </Card>
          <div className="mt-3 flex flex-wrap gap-2 no-print">
            <button type="submit" formAction={previewRunAction.bind(null, entityId)} className="btn-secondary">Recalculate preview</button>
            <SubmitButton pendingText="Saving…">Save as draft</SubmitButton>
          </div>
          <p className="mt-2 text-xs text-ink-500">Saving creates a draft you can still edit; approving posts the payroll journal (gross salaries, employer BPJS, PPh 21 payable, BPJS payable, net salaries payable).</p>
        </form>
      )}
    </div>
  );
}
