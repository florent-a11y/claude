import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Notice } from "@/components/ui";
import { Attachments } from "@/components/Attachments";
import { EmployeeForm } from "../../EmployeeForm";
import { updateEmployee } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function EditEmployee({ params, searchParams }: { params: Promise<{ entityId: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("tax:write");
  const { entityId, id } = await params;
  const sp = await searchParams;
  const employee = await db.get("employees", id);
  if (!employee || employee.entityId !== entityId) notFound();
  const here = `/payroll/${entityId}/employees/${id}/edit`;
  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center gap-2 no-print"><Link href={`/payroll/${entityId}/employees`} className="btn-ghost">‹ Employees</Link><h2 className="text-lg font-semibold">{employee.name}</h2></div>
      {sp.error ? <div className="mb-4"><Notice tone="red">{sp.error}</Notice></div> : sp.ok ? <div className="mb-4"><Notice tone="green">{sp.ok}</Notice></div> : null}
      <EmployeeForm employee={employee} action={updateEmployee.bind(null, id)} />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Attachments entityId={entityId} docType="employee" docId={employee.id} items={employee.attachments ?? []} canWrite={can(user, "tax:write")} backTo={here} className="lg:col-span-2" />
        <div className="text-xs text-ink-500 lg:pt-1"><p className="font-semibold text-ink-700">Personnel file</p><p className="mt-1">Keep the signed contract (PKWT/PKWTT), KTP and NPWP card, and for foreign staff the passport, KITAS and IMTA here; the payroll run holds the monthly payment proofs.</p></div>
      </div>
    </div>
  );
}
