import type { TaxObligation } from "@/lib/types";

/** Where the data behind an obligation lives. */
export function relatedLink(o: Pick<TaxObligation, "type" | "period" | "entityId">): { href: string; label: string } | undefined {
  const e = o.entityId;
  const year = o.period.slice(0, 4);
  switch (o.type) {
    case "pph21": return { href: `/tax/${e}/pph21?year=${year}`, label: "PPh 21" };
    case "payroll": case "bpjs": return { href: `/payroll/${e}?period=${o.period}`, label: "Payroll run" };
    case "pph23": case "pph26": case "pph4_2": return { href: `/tax/${e}/withholding?period=${o.period}`, label: "Bukti potong" };
    case "ppn": return { href: `/tax/${e}/ppn?period=${o.period}`, label: "PPN register" };
    case "lkpm": return { href: `/tax/${e}/lkpm?quarter=${o.period}`, label: "LKPM pack" };
    case "spt_badan": case "annual_report": return { href: `/tax/${e}/cit?year=${year}`, label: "CIT computation" };
    case "pph_final_umkm": case "pph25": return { href: `/tax/${e}/cit?year=${year}`, label: "Turnover / CIT" };
    case "bookkeeping": return { href: `/books/${e}`, label: "Books" };
    default: return undefined;
  }
}
