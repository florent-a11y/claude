import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { Card, EmptyState, Badge } from "@/components/ui";

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
        <Card className="overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Name</th><th>Position</th><th>PTKP</th><th>NPWP</th><th className="num">Basic salary</th><th className="num">Allowances</th><th>BPJS</th><th>Joined</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className={e.active ? "" : "text-ink-500"}>
                  <td className="pl-4 font-medium">{e.name}{e.isForeign && <span className="ml-1 text-[10px] text-brand-600">TKA</span>}</td>
                  <td className="text-xs">{e.position ?? "—"}</td>
                  <td className="text-xs">{e.ptkpStatus}</td>
                  <td className="text-xs">{e.npwp ?? <span className="text-red-700">none (+20%)</span>}</td>
                  <td className="num">{e.basicSalary.toLocaleString("en-US")}</td>
                  <td className="num">{e.allowances.reduce((s, a) => s + a.amount, 0).toLocaleString("en-US")}</td>
                  <td className="text-[10px]">{[e.bpjs.kesehatan && "Kes", e.bpjs.jht && "JHT", e.bpjs.jp && "JP", e.bpjs.jkk && `JKK${e.bpjs.jkkRiskClass}`, e.bpjs.jkm && "JKM"].filter(Boolean).join(" · ") || "none"}</td>
                  <td className="text-xs">{fmtDate(e.joinDate)}{e.endDate && <><br />left {fmtDate(e.endDate)}</>}</td>
                  <td><Badge tone={e.active ? "green" : "slate"}>{e.active ? "active" : "inactive"}</Badge></td>
                  <td className="text-xs">{canWrite && <Link href={`/payroll/${entityId}/employees/${e.id}/edit`} className="text-brand-600 underline">edit</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
