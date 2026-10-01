import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel, todayISO } from "@/lib/dates";
import { OBLIGATION_LABELS, OBLIGATION_STATUSES, OBLIGATION_STATUS_LABELS, OBLIGATION_TYPES, type ObligationType, type TaxObligation } from "@/lib/types";
import { isOverdue, obligationTypesFor } from "@/lib/tax/calendar";
import { Card, Field, Money, Select, Stat, EmptyState, Chips, Badge, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ObligationCell } from "../ObligationCell";
import { relatedLink } from "../links";
import { generateEntityObligations, updateObligation } from "../actions";

export const dynamic = "force-dynamic";

const SHORT: Record<ObligationType, string> = {
  bookkeeping: "Books", pph21: "PPh 21", pph23: "PPh 23", pph26: "PPh 26", pph4_2: "PPh 4(2)", pph25: "PPh 25", ppn: "PPN", local_tax: "PB1", bpjs: "BPJS", payroll: "Payroll",
  lkpm: "LKPM", spt_badan: "SPT Badan", spt_op: "SPT OP", gms: "RUPS", annual_report: "Annual", pph_final_umkm: "PPh 0.5%", other: "Other",
};

export default async function EntityCalendar({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const today = todayISO();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : Number(today.slice(0, 4));
  const [obligations, users] = await Promise.all([
    db.list("tax_obligations", { where: (o) => o.entityId === entityId && o.period.startsWith(String(year)) }),
    db.list("users", { where: { active: true }, orderBy: "name" }),
  ]);
  const canWrite = can(user, "tax:write");
  const cellUsers = users.map((u) => ({ id: u.id, name: u.name }));
  const profileTypes = obligationTypesFor(entity);
  const types = OBLIGATION_TYPES.filter((t) => profileTypes.includes(t) || obligations.some((o) => o.type === t));
  const monthly = types.filter((t) => obligations.some((o) => o.type === t && o.period.length === 7));
  const quarterly = types.filter((t) => obligations.some((o) => o.type === t && /Q/.test(o.period)));
  const yearly = types.filter((t) => obligations.some((o) => o.type === t && o.period.length === 4));
  const find = (t: ObligationType, period: string) => obligations.find((o) => o.type === t && o.period === period);
  const selected = sp.o ? obligations.find((o) => o.id === sp.o) : undefined;
  const counts = { total: obligations.length, done: obligations.filter((o) => ["paid", "reported", "nil"].includes(o.status)).length, overdue: obligations.filter((o) => isOverdue(o, today)).length, amount: obligations.reduce((s, o) => s + (o.amount ?? 0), 0) };
  const periods = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const cell = (o: TaxObligation | undefined) => {
    if (!o) return <span className="text-xs text-slate-300">—</span>;
    const link = relatedLink(o);
    return (
      <div className="space-y-0.5">
        <ObligationCell id={o.id} status={o.status} assigneeUserId={o.assigneeUserId} users={cellUsers} canWrite={canWrite} overdue={isOverdue(o, today)} />
        <div className="flex flex-wrap items-center gap-1 px-1 text-[10px] text-ink-500">
          <Link href={`/tax/${entityId}?year=${year}&o=${encodeURIComponent(o.id)}`} className={`underline ${selected?.id === o.id ? "font-semibold text-brand-700" : ""}`}>edit</Link>
          {link && <Link href={link.href} className="underline">{link.label}</Link>}
          {o.amount ? <span className="tabular-nums">{o.amount.toLocaleString("en-US")}</span> : null}
          {o.ntpn && <span title={`NTPN ${o.ntpn}`}>NTPN ✓</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <Chips items={[year - 1, year, year + 1].map((y) => ({ href: `/tax/${entityId}?year=${y}`, label: String(y), active: y === year }))} />
        {canWrite && (
          <form action={generateEntityObligations.bind(null, entityId)} className="flex items-center gap-2">
            <input type="hidden" name="year" value={year} />
            <SubmitButton className="btn-secondary" pendingText="Generating…">Generate {year} obligations</SubmitButton>
          </form>
        )}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Obligations ${year}`} value={counts.total} hint={`${profileTypes.length} types in profile`} />
        <Stat label="Done" value={counts.done} tone="text-green-700" />
        <Stat label="Overdue" value={counts.overdue} tone={counts.overdue ? "text-red-700" : ""} />
        <Stat label="Amounts recorded" value={<Money amount={counts.amount} />} />
      </div>

      {obligations.length === 0 ? (
        <EmptyState title={`No obligations for ${year}`} hint="Generate them from the entity's tax profile (PKP, payroll, LKPM, regime, PPh 25, regional tax)." />
      ) : (
        <>
          <Card className="overflow-x-auto !p-0" title={undefined}>
            <table className="table">
              <thead><tr><th className="sticky left-0 bg-white pl-4">Period</th>{monthly.map((t) => <th key={t} title={OBLIGATION_LABELS[t]}>{SHORT[t]}</th>)}</tr></thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p}>
                    <td className="sticky left-0 bg-white pl-4 align-top text-xs font-medium">{periodLabel(p)}<br /><span className="font-normal text-ink-500">due {fmtDate(find(monthly[0], p)?.reportDue)}</span></td>
                    {monthly.map((t) => <td key={t} className="align-top">{cell(find(t, p))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {(quarterly.length > 0 || yearly.length > 0) && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {quarterly.length > 0 && (
                <Card title="Quarterly" className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Quarter</th>{quarterly.map((t) => <th key={t}>{SHORT[t]}</th>)}</tr></thead>
                    <tbody>{[1, 2, 3, 4].map((q) => { const p = `${year}-Q${q}`; return <tr key={p}><td className="text-xs font-medium">{p}<br /><span className="font-normal text-ink-500">due {fmtDate(find(quarterly[0], p)?.reportDue)}</span></td>{quarterly.map((t) => <td key={t}>{cell(find(t, p))}</td>)}</tr>; })}</tbody>
                  </table>
                </Card>
              )}
              {yearly.length > 0 && (
                <Card title="Annual" className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Filing</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>{yearly.map((t) => { const o = find(t, String(year)); return <tr key={t}><td className="text-xs font-medium">{OBLIGATION_LABELS[t]}</td><td className="text-xs">{fmtDate(o?.reportDue)}</td><td>{cell(o)}</td></tr>; })}</tbody>
                  </table>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {selected && (
        <Card className="mt-4" title={<>Edit · {selected.label} · {periodLabel(selected.period)} <Badge tone={statusTone(selected.status)}>{OBLIGATION_STATUS_LABELS[selected.status]}</Badge></>} actions={<Link href={`/tax/${entityId}?year=${year}`} className="text-xs underline">close</Link>}>
          <p className="mb-3 text-xs text-ink-500">Data due {fmtDate(selected.dataDue)} · payment due {fmtDate(selected.paymentDue)} · report due {fmtDate(selected.reportDue)}{isOverdue(selected, today) && <span className="ml-2 font-semibold text-red-700">OVERDUE</span>}
            {relatedLink(selected) && <> · <Link className="underline" href={relatedLink(selected)!.href}>open {relatedLink(selected)!.label}</Link></>}</p>
          <form action={updateObligation.bind(null, selected.id)} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="back" value={`/tax/${entityId}?year=${year}&o=${encodeURIComponent(selected.id)}`} />
            <Field label="Status"><Select name="status" defaultValue={selected.status} options={OBLIGATION_STATUSES.map((s) => ({ value: s, label: OBLIGATION_STATUS_LABELS[s] }))} /></Field>
            <Field label="Assignee"><Select name="assigneeUserId" defaultValue={selected.assigneeUserId ?? ""} options={[{ value: "", label: "— unassigned —" }, ...users.map((u) => ({ value: u.id, label: u.name }))]} /></Field>
            <Field label="Amount (IDR)"><input name="amount" type="number" min={0} defaultValue={selected.amount ?? ""} className="input" /></Field>
            <Field label="NTPN"><input name="ntpn" defaultValue={selected.ntpn} className="input" placeholder="16-character receipt" /></Field>
            <Field label="Paid on"><input name="paidAt" type="date" defaultValue={selected.paidAt} className="input" /></Field>
            <Field label="Reported on"><input name="reportedAt" type="date" defaultValue={selected.reportedAt} className="input" /></Field>
            <Field label="Notes" className="md:col-span-2"><input name="notes" defaultValue={selected.notes} className="input" placeholder="e.g. client sent bank statement late" /></Field>
            <div className="md:col-span-4">{canWrite ? <SubmitButton>Save</SubmitButton> : <p className="text-xs text-ink-500">Read-only: accountants and admins can edit.</p>}</div>
          </form>
        </Card>
      )}
    </div>
  );
}
