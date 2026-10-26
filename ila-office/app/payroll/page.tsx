import Link from "next/link";
import { requireUser, scopeEntities } from "@/lib/auth";
import { db } from "@/lib/db";
import { periodLabel } from "@/lib/dates";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_SHORT } from "@/lib/types";
import { Page, EmptyState, Badge, Cols, Dash, TableCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payroll" };

export default async function PayrollHome() {
  const user = await requireUser();
  const [entities, employees, runs] = await Promise.all([
    db.list("entities", { where: (e) => e.tax.payroll && e.status !== "closed", orderBy: "name" }).then((rows) => scopeEntities(user, rows)),
    db.list("employees", { where: { active: true } }),
    db.list("payroll_runs", { orderBy: "period", desc: true }),
  ]);
  return (
    <Page title="Payroll" subtitle="Entities flagged for payroll (PPh 21 + BPJS). Monthly cycle: reminder from the 20th, calculation and client approval 26th–28th, salaries on the 1st, PPh 21 by the 10th, BPJS by the 15th.">
      {entities.length === 0 ? <EmptyState title="No entity has payroll enabled" hint="Tick “Has employees” on the entity in Settings › Entities." action={<Link href="/settings/entities" className="btn-secondary">Entities</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[800px]">
            <Cols widths={[undefined, 130, 145, 110, 100, 140]} />
            <thead><tr><th>Entity</th><th>Type</th><th className="num">Active employees</th><th>Last run</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {entities.map((e) => {
                const last = runs.find((r) => r.entityId === e.id);
                return (
                  <tr key={e.id}>
                    <td><Link href={`/payroll/${e.id}`} className="cell-primary" title={e.name}>{e.isOwn && <span className="mr-1 text-accent-600">★</span>}{e.name}</Link></td>
                    <td><span className="cell" title={ENTITY_TYPE_LABELS[e.type]}>{ENTITY_TYPE_SHORT[e.type]}</span></td>
                    <td className="num">{employees.filter((x) => x.entityId === e.id).length}</td>
                    <td className="whitespace-nowrap">{last ? periodLabel(last.period) : <Dash />}</td>
                    <td>{last ? <Badge tone={last.status === "paid" ? "green" : last.status === "approved" ? "blue" : "slate"}>{last.status}</Badge> : <span className="text-xs text-ink-500">no run yet</span>}</td>
                    <td className="whitespace-nowrap text-right text-xs"><Link className="text-brand-600 hover:underline" href={`/payroll/${e.id}`}>Runs</Link><span className="mx-1 text-slate-300">·</span><Link className="text-brand-600 hover:underline" href={`/payroll/${e.id}/employees`}>Employees</Link></td>
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
