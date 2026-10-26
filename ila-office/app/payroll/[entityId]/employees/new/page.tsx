import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { EmployeeForm } from "../EmployeeForm";
import { createEmployee } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function NewEmployee({ params }: { params: Promise<{ entityId: string }> }) {
  await requirePermission("tax:write");
  const { entityId } = await params;
  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center gap-2 no-print"><Link href={`/payroll/${entityId}/employees`} className="btn-ghost">‹ Employees</Link><h2 className="text-lg font-semibold">New employee</h2></div>
      <EmployeeForm action={createEmployee.bind(null, entityId)} />
    </div>
  );
}
