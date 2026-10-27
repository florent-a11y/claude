import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/client";

/**
 * Title block with the filter form (GET), the export links (CSV · Excel · PDF, the PDF only where the API renders
 * one) and the print button, shared by every report page. The title block carries `report-header` so the print
 * stylesheet can centre it with the company name in bold (see app/globals.css).
 */
export function ReportHeader({ title, subtitle, entityLegalName, csvHref, xlsxHref, pdfHref, children }: {
  title: string; subtitle: ReactNode; entityLegalName: string; csvHref: string; xlsxHref?: string; pdfHref?: string; children?: ReactNode;
}) {
  const sep = <span aria-hidden className="text-slate-300">·</span>;
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="report-header">
        <p className="report-entity text-xs text-ink-500">{entityLegalName}</p>
        <h2 className="report-title text-xl font-bold">{title}</h2>
        <p className="report-subtitle text-sm text-ink-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 no-print">
        {children && <form method="get" className="flex flex-wrap items-end gap-2">{children}<button className="btn-secondary !py-1 text-xs" type="submit">Apply</button></form>}
        <div className="flex h-[30px] items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs ring-1 ring-slate-300" aria-label="Export">
          <span className="text-ink-500">Export:</span>
          <Link href={csvHref} className="font-semibold text-brand-700 hover:underline">CSV</Link>
          {xlsxHref && <>{sep}<Link href={xlsxHref} className="font-semibold text-brand-700 hover:underline">Excel</Link></>}
          {pdfHref && <>{sep}<Link href={pdfHref} className="font-semibold text-brand-700 hover:underline">PDF</Link></>}
        </div>
        <PrintButton label="Print" className="!py-1 text-xs" />
      </div>
    </div>
  );
}

/** The three export links of one report: `base` is the API URL with its filters (CSV by default). */
export function exportHrefs(base: string, withPdf: boolean): { csvHref: string; xlsxHref: string; pdfHref?: string } {
  const sep = base.includes("?") ? "&" : "?";
  return { csvHref: base, xlsxHref: `${base}${sep}format=xlsx`, pdfHref: withPdf ? `${base}${sep}format=pdf` : undefined };
}
