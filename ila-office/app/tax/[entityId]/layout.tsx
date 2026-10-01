import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS, TAX_REGIME_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui";
import { EntityTabs } from "./EntityTabs";

export const dynamic = "force-dynamic";

export default async function TaxEntityLayout({ params, children }: { params: Promise<{ entityId: string }>; children: ReactNode }) {
  await requireUser();
  const { entityId } = await params;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-600">Tax & compliance</p>
          <h1 className="text-xl font-bold tracking-tight">{entity.isOwn && <span className="mr-1 text-accent-600">★</span>}{entity.name}</h1>
          <p className="text-xs text-ink-500">{entity.legalName} · {ENTITY_TYPE_LABELS[entity.type]} · NPWP {entity.npwp ?? "—"}{entity.tax.kppOffice ? ` · ${entity.tax.kppOffice}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge tone="brand">{TAX_REGIME_LABELS[entity.tax.regime].split(" (")[0]}</Badge>
          <Badge tone={entity.tax.pkp ? "green" : "slate"}>{entity.tax.pkp ? `PKP · PPN ${(entity.tax.ppnRate * 100).toFixed(0)}%` : "Non-PKP"}</Badge>
          {entity.tax.payroll && <Badge tone="blue">Payroll</Badge>}
          {entity.tax.lkpm && <Badge tone="indigo">LKPM</Badge>}
          {entity.tax.localTaxRate ? <Badge tone="amber">Regional tax {(entity.tax.localTaxRate * 100).toFixed(0)}%</Badge> : null}
          {entity.tax.pph25Monthly ? <Badge tone="slate">PPh 25 {entity.tax.pph25Monthly.toLocaleString("en-US")}/mo</Badge> : null}
          <Badge tone={entity.status === "active" ? "green" : "red"}>{entity.status}</Badge>
        </div>
      </div>
      <EntityTabs entityId={entity.id} />
      {children}
    </div>
  );
}
