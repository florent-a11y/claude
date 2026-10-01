import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS } from "@/lib/types";
import { Page, EmptyState, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payroll" };

export default async function PayrollHome() {
  await requireUser();
  const [entities, employees, runs] = await Promise.all([
    db.list("entities", { where: (e) => e.tax.payroll && e.status !== "closed", orderBy: "name" }),
    db.list("employees", { where: { active: true } }),
    db.list("payroll_runs", { orderBy: "period", desc: true }),
  ]);
  return (
    <Page title="Payroll" subtitle="Entities flagged for payroll (PPh 21 + BPJS). Monthly cycle: reminder from the 20th, calculation and client approval 26th–28th, salaries on the 1st, PPh 21 by the 10th, BPJS by the 15th.">
      {entities.length === 0 ? <EmptyState title="No entity has payroll enabled" hint="Tick “Has employees” on the entity in Settings › Entities." action={<Link href="/settings/entities" className="btn-secondary">Entities</Link>} /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Entity</th><th>Type</th><th className="num">Active employees</th><th>Last run</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {entities.map((e) => {
                const last = runs.find((r) => r.entityId === e.id);
                return (
                  <tr key={e.id}>
                    <td className="pl-4 font-medium"><Link href={`/payroll/${e.id}`} className="hover:underline">{e.isOwn && <span className="mr-1 text-accent-600">★</span>}{e.name}</Link></td>
                    <td className="text-xs">{ENTITY_TYPE_LABELS[e.type]}</td>
                    <td className="num">{employees.filter((x) => x.entityId === e.id).length}</td>
                    <td className="text-xs">{last ? last.period : "—"}</td>
                    <td>{last ? <Badge tone={last.status === "paid" ? "green" : last.status === "approved" ? "blue" : "slate"}>{last.status}</Badge> : <span className="text-xs text-ink-500">no run yet</span>}</td>
                    <td className="whitespace-nowrap text-xs"><Link className="text-brand-600 underline" href={`/payroll/${e.id}`}>Runs</Link> · <Link className="text-brand-600 underline" href={`/payroll/${e.id}/employees`}>Employees</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
