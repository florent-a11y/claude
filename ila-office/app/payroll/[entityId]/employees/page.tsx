import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { Cols, EmptyState, Badge, TableCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ params }: { params: Promise<{ entityId: string }> }) {
  const user = await requireUser();
  const { entityId } = await params;
  const employees = await db.list("employees", { where: { entityId }, orderBy: "name" });
  const canWrite = can(user, "tax:write");
  return (
    <div className="space-y-4 pb-8">
      <div className="flex justify-end no-print">{canWrite && <Link href={`/payroll/${entityId}/employees/new`} className="btn-primary">New employee</Link>}</div>
      {employees.length === 0 ? <EmptyState title="No employee yet" hint="Add employees with their PTKP status, NPWP and BPJS flags; payroll runs pick up active ones." action={canWrite && <Link href={`/payroll/${entityId}/employees/new`} className="btn-primary">New employee</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[1120px]">
            <Cols widths={[undefined, 70, 180, 130, 120, 175, 110, 90, ...(canWrite ? [60] : [])]} />
            <thead><tr><th>Name</th><th>PTKP</th><th>NPWP</th><th className="num">Basic salary</th><th className="num">Allowances</th><th>BPJS</th><th>Joined</th><th>Status</th>{canWrite && <th></th>}</tr></thead>
            <tbody>
              {employees.map((e) => {
                const bpjs = [e.bpjs.kesehatan && "Kes", e.bpjs.jht && "JHT", e.bpjs.jp && "JP", e.bpjs.jkk && `JKK${e.bpjs.jkkRiskClass}`, e.bpjs.jkm && "JKM"].filter(Boolean).join(" · ") || "none";
                return (
                  <tr key={e.id} className={e.active ? "" : "row-muted"}>
                    <td>
                      <span className="cell-primary" title={e.name}>{e.name}{e.isForeign && <span className="ml-1 text-[10px] text-brand-600">TKA</span>}</span>
                      {e.position && <span className="cell-sub" title={e.position}>{e.position}</span>}
                    </td>
                    <td className="whitespace-nowrap">{e.ptkpStatus}</td>
                    <td className="whitespace-nowrap">{e.npwp ?? <span className="text-red-700">none (+20%)</span>}</td>
                    <td className="num">{e.basicSalary.toLocaleString("en-US")}</td>
                    <td className="num">{e.allowances.reduce((s, a) => s + a.amount, 0).toLocaleString("en-US")}</td>
                    <td><span className="cell text-xs" title={bpjs}>{bpjs}</span></td>
                    <td className="whitespace-nowrap">{fmtDate(e.joinDate)}{e.endDate && <span className="cell-sub">left {fmtDate(e.endDate)}</span>}</td>
                    <td><Badge tone={e.active ? "green" : "slate"}>{e.active ? "active" : "inactive"}</Badge></td>
                    {canWrite && <td className="text-right text-xs"><Link href={`/payroll/${entityId}/employees/${e.id}/edit`} className="text-brand-600 hover:underline">edit</Link></td>}
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
