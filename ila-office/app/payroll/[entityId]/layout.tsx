import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Notice } from "@/components/ui";
import { PayrollTabs } from "./PayrollTabs";

export const dynamic = "force-dynamic";

export default async function PayrollEntityLayout({ params, children }: { params: Promise<{ entityId: string }>; children: ReactNode }) {
  await requireUser();
  const { entityId } = await params;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const employees = await db.count("employees", { entityId, active: true });
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-600">Payroll</p>
          <h1 className="text-xl font-bold tracking-tight">{entity.isOwn && <span className="mr-1 text-accent-600">★</span>}{entity.name}</h1>
          <p className="text-xs text-ink-500">{entity.legalName} · NPWP {entity.npwp ?? "—"}</p>
        </div>
        <div className="flex gap-1"><Badge tone={entity.tax.payroll ? "blue" : "amber"}>{entity.tax.payroll ? "Payroll enabled" : "Payroll flag off"}</Badge><Badge tone="slate">{employees} active</Badge></div>
      </div>
      <PayrollTabs entityId={entity.id} employees={employees} />
      {!entity.tax.payroll && <div className="mb-4 no-print"><Notice tone="amber">This entity is not flagged “Has employees”. Enable it in Settings so PPh 21 and BPJS obligations are generated in the calendar.</Notice></div>}
      {children}
    </div>
  );
}
