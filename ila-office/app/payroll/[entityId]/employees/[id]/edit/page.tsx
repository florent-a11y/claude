import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmployeeForm } from "../../EmployeeForm";
import { updateEmployee } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function EditEmployee({ params }: { params: Promise<{ entityId: string; id: string }> }) {
  await requirePermission("tax:write");
  const { entityId, id } = await params;
  const employee = await db.get("employees", id);
  if (!employee || employee.entityId !== entityId) notFound();
  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center gap-2 no-print"><Link href={`/payroll/${entityId}/employees`} className="btn-ghost">‹ Employees</Link><h2 className="text-lg font-semibold">{employee.name}</h2></div>
      <EmployeeForm employee={employee} action={updateEmployee.bind(null, id)} />
    </div>
  );
}
