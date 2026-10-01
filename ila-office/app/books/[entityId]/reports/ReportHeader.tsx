import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/client";

/** Title row with the filter form (GET), CSV export link and print button, shared by every report page. */
export function ReportHeader({ title, subtitle, entityLegalName, csvHref, children }: { title: string; subtitle: ReactNode; entityLegalName: string; csvHref: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs text-ink-500 print:text-sm">{entityLegalName}</p><h2 className="text-xl font-bold">{title}</h2><p className="text-sm text-ink-500">{subtitle}</p></div>
      <div className="flex flex-wrap items-end gap-2 no-print">
        {children && <form method="get" className="flex flex-wrap items-end gap-2">{children}<button className="btn-secondary !py-1 text-xs" type="submit">Apply</button></form>}
        <Link href={csvHref} className="btn-secondary !py-1 text-xs">Export CSV</Link>
        <PrintButton label="Print" />
      </div>
    </div>
  );
}
