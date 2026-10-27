import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { csvResponse } from "@/lib/csv";
import { xlsxResponse, type XlsxSheet } from "@/lib/report-xlsx";
import { renderStatementPdf, pdfNumber, type StatementColumn, type StatementRow } from "@/lib/report-pdf";
import { entityAccounts, entityEntries } from "@/lib/books";
import { trialBalance, profitAndLoss, profitAndLossMonthly, balanceSheet, generalLedger, arAging, apAging, fiscalYearStartOf, AGING_BUCKETS, entryTotal, type ProfitAndLoss, type ReportSection } from "@/lib/ledger";
import { addDays, fmtDate, todayISO } from "@/lib/dates";
import { naturalBalance, accountBalances } from "@/lib/balances";
import type { Account, Entity, JournalEntry } from "@/lib/types";

export const runtime = "nodejs";

type Format = "csv" | "xlsx" | "pdf";

/** Rows for the PDF renderer, built lazily because only the statements have one. */
interface PdfSpec { title: string; subtitle: string; columns: StatementColumn[]; rows: StatementRow[]; landscape?: boolean; note?: string; fontSize?: number }
interface ReportOutput {
  /** File name without extension. */
  file: string;
  /** The CSV table (the first workbook sheet unless the CSV flattens several). */
  csv: { headers: string[]; rows: unknown[][] };
  sheets: XlsxSheet[];
  pdf?: () => PdfSpec;
}

/**
 * GET /api/books/:entityId/reports/:report?…&format=csv|xlsx|pdf → download (CSV by default, so older links keep
 * working). Reports: trial-balance (asOf), profit-loss (from, to, compare | view=monthly), balance-sheet (asOf),
 * general-ledger (accountId, from, to), ar-aging (asOf), ap-aging (asOf), accounts, journal (from, to).
 * PDF is available for the four statements: profit-loss, balance-sheet, trial-balance and general-ledger.
 */
export async function GET(req: Request, ctx: { params: Promise<{ entityId: string; report: string }> }) {
  const user = await guard("read", (await ctx.params).entityId);
  if (user instanceof Response) return user;
  const { entityId, report } = await ctx.params;
  const entity = await db.get("entities", entityId);
  if (!entity) return new Response("Entity not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const format = parseFormat(q.get("format"));
  if (!format) return new Response("format must be csv, xlsx or pdf", { status: 400 });
  const today = todayISO();
  const asOf = q.get("asOf") ?? q.get("to") ?? today;
  const to = q.get("to") ?? asOf;
  const from = q.get("from") ?? fiscalYearStartOf(to, entity.fiscalYearStartMonth);
  const slug = entity.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const [accounts, entries] = await Promise.all([entityAccounts(entityId), entityEntries(entityId)]);
  const n = pdfNumber;
  let out: ReportOutput;

  switch (report) {
    case "trial-balance": {
      const tb = trialBalance(accounts, entries, asOf);
      const headers = ["Code", "Account", "Type", "Debit", "Credit"];
      const rows: unknown[][] = [...tb.rows.map((r) => [r.account.code, r.account.name, r.account.type, r.debit, r.credit]), ["", "Total", "", tb.totalDebit, tb.totalCredit]];
      out = {
        file: `${slug}-trial-balance-${asOf}`, csv: { headers, rows }, sheets: [{ name: "Trial balance", headers, rows, colWidths: [10, 40, 12, 18, 18] }],
        pdf: () => ({
          title: "Trial balance", subtitle: `As of ${fmtDate(asOf)} · ${tb.rows.length} accounts${tb.balanced ? "" : " · OUT OF BALANCE"}`,
          columns: [{ label: "Code", width: 55, align: "left" }, { label: "Account", width: 230, align: "left" }, { label: "Type", width: 60, align: "left" }, { label: "Debit", width: 85, align: "right" }, { label: "Credit", width: 85, align: "right" }],
          rows: [...tb.rows.map((r): StatementRow => ({ cells: [r.account.code, r.account.name, r.account.type, r.debit ? n(r.debit) : "", r.credit ? n(r.credit) : ""] })), { cells: ["", "Total", "", n(tb.totalDebit), n(tb.totalCredit)], style: "grand" }],
        }),
      };
      break;
    }
    case "profit-loss": {
      out = q.get("view") === "monthly" ? plMonthlyOutput(accounts, entries, from, to, slug) : plPeriodOutput(accounts, entries, from, to, q.get("compare") === "1", slug);
      break;
    }
    case "balance-sheet": {
      const bs = balanceSheet(accounts, entries, asOf, entity.fiscalYearStartMonth);
      const groups = [["Assets", bs.assets, bs.totalAssets], ["Liabilities", bs.liabilities, bs.totalLiabilities], ["Equity", bs.equity, bs.totalEquity]] as const;
      const rows: unknown[][] = [];
      for (const [group, sections, total] of groups) {
        for (const s of sections) { for (const r of s.rows) rows.push([group, s.label, r.account.code, r.account.name, r.amount]); rows.push([group, s.label, "", `Total ${s.label}`, s.total]); }
        rows.push([group, "", "", `Total ${group}`, total]);
      }
      const headers = ["Group", "Section", "Code", "Account", `As of ${asOf}`];
      out = {
        file: `${slug}-balance-sheet-${asOf}`, csv: { headers, rows }, sheets: [{ name: "Balance sheet", headers, rows, colWidths: [12, 22, 10, 40, 18] }],
        pdf: () => {
          const pdfRows: StatementRow[] = [];
          for (const [group, sections, total] of groups) {
            pdfRows.push({ cells: [group, ""], style: "section" });
            for (const s of sections) {
              if (sections.length > 1) pdfRows.push({ cells: [s.label, ""], style: "section" });
              for (const r of s.rows) pdfRows.push({ cells: [`${r.account.code}  ${r.account.name}${r.account.taxTag === "current_earnings" ? ` (from ${fmtDate(bs.fiscalYearStart)})` : ""}`, n(r.amount)], style: "indent" });
              if (s.rows.length === 0) pdfRows.push({ cells: ["No balances", ""], style: "indent" });
              if (sections.length > 1) pdfRows.push({ cells: [`Total ${s.label.toLowerCase()}`, n(s.total)], style: "total" });
            }
            pdfRows.push({ cells: [`Total ${group.toLowerCase()}`, n(total)], style: "grand" });
          }
          pdfRows.push({ cells: ["Total liabilities and equity", n(bs.totalLiabilities + bs.totalEquity)], style: "grand" });
          return {
            title: "Balance sheet", subtitle: `As of ${fmtDate(asOf)} · fiscal year from ${fmtDate(bs.fiscalYearStart)}${bs.balanced ? "" : " · OUT OF BALANCE"}`,
            columns: [{ label: "Account", width: 300, align: "left" }, { label: `As of ${fmtDate(asOf)}`, width: 110, align: "right" }], rows: pdfRows,
          };
        },
      };
      break;
    }
    case "general-ledger": {
      const account = accounts.find((a) => a.id === q.get("accountId"));
      if (!account) return new Response("accountId required", { status: 400 });
      const gl = generalLedger(account, entries, { from, to });
      const headers = ["Date", "Entry", "Memo", "Description", "Counterparty", "Debit", "Credit", "Balance"];
      const rows: unknown[][] = [
        ["", "", `Opening balance ${from}`, "", "", "", "", gl.opening],
        ...gl.rows.map((r) => [r.date, r.number, r.memo, r.description ?? "", r.counterpartyName ?? "", r.debit, r.credit, r.balance]),
        ["", "", `Closing balance ${to}`, "", "", gl.totalDebit, gl.totalCredit, gl.closing],
      ];
      const label = `${account.code} · ${account.name}`;
      out = {
        file: `${slug}-gl-${account.code}-${from}-${to}`, csv: { headers, rows },
        sheets: [
          { name: "General ledger", headers, rows, colWidths: [12, 14, 36, 36, 24, 18, 18, 18] },
          { name: "Summary", headers: ["Account", "From", "To", "Opening balance", "Total debit", "Total credit", "Closing balance"], rows: [[label, from, to, gl.opening, gl.totalDebit, gl.totalCredit, gl.closing]], colWidths: [36, 12, 12, 18, 18, 18, 18] },
        ],
        pdf: () => ({
          title: "General ledger", subtitle: `${label} · ${fmtDate(from)} – ${fmtDate(to)} · ${account.normalBalance} balance`, landscape: true,
          columns: [
            { label: "Date", width: 68, align: "left" }, { label: "Entry", width: 66, align: "left" }, { label: "Memo", width: 146, align: "left" }, { label: "Description", width: 144, align: "left" },
            { label: "Counterparty", width: 110, align: "left" }, { label: "Debit", width: 74, align: "right" }, { label: "Credit", width: 74, align: "right" }, { label: "Balance", width: 80, align: "right" },
          ],
          rows: [
            { cells: ["", "", `Opening balance at ${fmtDate(from)}`, "", "", "", "", n(gl.opening)], style: "total" },
            ...gl.rows.map((r): StatementRow => ({ cells: [fmtDate(r.date), r.number, r.memo, r.description && r.description !== r.memo ? r.description : "", r.counterpartyName ?? "", r.debit ? n(r.debit) : "", r.credit ? n(r.credit) : "", n(r.balance)] })),
            { cells: ["", "", `Closing balance at ${fmtDate(to)}`, "", "", n(gl.totalDebit), n(gl.totalCredit), n(gl.closing)], style: "grand" },
          ],
        }),
      };
      break;
    }
    case "ar-aging":
    case "ap-aging": {
      const r = report === "ar-aging" ? arAging(await db.list("invoices", { where: { entityId } }), asOf) : apAging(await db.list("bills", { where: { entityId } }), asOf);
      const who = report === "ar-aging" ? "Customer" : "Vendor";
      const headers = [who, "Document", "Date", "Due", "Days overdue", "Bucket", "Currency", "Outstanding", "Outstanding IDR"];
      const detail: unknown[][] = r.rows.map((x) => [x.name, x.number, x.date, x.dueDate, x.daysOverdue, x.bucket, x.currency, x.outstanding, x.outstandingIDR]);
      const summaryHeaders = [who, ...AGING_BUCKETS, "Total"];
      const summary: unknown[][] = [...r.groups.map((g) => [g.name, ...AGING_BUCKETS.map((k) => g.buckets[k]), g.total]), ["Total", ...AGING_BUCKETS.map((k) => r.totals[k]), r.total]];
      out = {
        file: `${slug}-${report}-${asOf}`,
        csv: { headers, rows: [...detail, [], ["Summary", ...AGING_BUCKETS, "Total"], ...summary] },
        sheets: [{ name: "Detail", headers, rows: detail, colWidths: [32, 18, 12, 12, 12, 10, 10, 16, 18] }, { name: "Summary", headers: summaryHeaders, rows: summary, colWidths: [32, 16, 16, 16, 16, 16, 18] }],
      };
      break;
    }
    case "accounts": {
      const bal = accountBalances(entries);
      const headers = ["Code", "Name", "Nama", "Type", "Subtype", "Normal", "Tax tag", "Deductible", "System", "Active", "Balance"];
      const rows = [...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => [a.code, a.name, a.nameId ?? "", a.type, a.subtype, a.normalBalance, a.taxTag ?? "", a.deductible === undefined ? "" : a.deductible ? "yes" : "no", a.isSystem ? "yes" : "no", a.active ? "yes" : "no", naturalBalance(a, bal.get(a.id))]);
      out = { file: `${slug}-accounts`, csv: { headers, rows }, sheets: [{ name: "Accounts", headers, rows }] };
      break;
    }
    case "journal": {
      const all = await db.list("journal_entries", { where: (e) => e.entityId === entityId && e.date >= from && e.date <= to, orderBy: "date" });
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const rows: unknown[][] = [];
      for (const e of all) for (const l of e.lines) rows.push([e.number, e.date, e.period, e.status, e.source, e.memo, entryTotal(e), l.accountCode, byId.get(l.accountId)?.name ?? "", l.description ?? "", l.counterpartyName ?? "", l.debit, l.credit, l.currency ?? "", l.fxAmount ?? "", l.fxRate ?? ""]);
      const headers = ["Entry", "Date", "Period", "Status", "Source", "Memo", "Entry total", "Account code", "Account", "Line description", "Counterparty", "Debit", "Credit", "Currency", "FX amount", "FX rate"];
      out = { file: `${slug}-journal-${from}-${to}`, csv: { headers, rows }, sheets: [{ name: "Journal", headers, rows }] };
      break;
    }
    default:
      return new Response("Unknown report", { status: 404 });
  }
  return send(format, out, entity);
}

function parseFormat(raw: string | null): Format | null {
  if (!raw || raw === "csv") return "csv";
  if (raw === "xlsx" || raw === "excel") return "xlsx";
  if (raw === "pdf") return "pdf";
  return null;
}

async function send(format: Format, out: ReportOutput, entity: Entity): Promise<Response> {
  if (format === "csv") return csvResponse(out.csv.headers, out.csv.rows, `${out.file}.csv`);
  if (format === "xlsx") return xlsxResponse(out.sheets, `${out.file}.xlsx`);
  if (!out.pdf) return new Response("PDF is available for the profit & loss, balance sheet, trial balance and general ledger only", { status: 400 });
  const pdf = await renderStatementPdf({ entity: { legalName: entity.legalName, name: entity.name, address: [entity.address, entity.city].filter(Boolean).join(", ") || undefined, npwp: entity.npwp }, ...out.pdf() });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${out.file}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}

const PL_SUMMARY: Array<[string, (p: ProfitAndLoss) => number, string]> = [["Gross profit", (p) => p.grossProfit, "cogs"], ["Operating profit", (p) => p.operatingProfit, "opex"], ["Profit before tax", (p) => p.profitBeforeTax, "other_expense"], ["Net profit", (p) => p.netProfit, "tax"]];

/** Accounts of a section in code order, including those that only have a figure in the comparison column. */
function sectionAccounts(accounts: Account[], s: ReportSection, ps?: ReportSection): Account[] {
  const ids = new Set([...s.rows.map((r) => r.account.id), ...(ps?.rows.map((r) => r.account.id) ?? [])]);
  return accounts.filter((x) => ids.has(x.id)).sort((x, y) => x.code.localeCompare(y.code));
}

function plPeriodOutput(accounts: Account[], entries: JournalEntry[], from: string, to: string, compare: boolean, slug: string): ReportOutput {
  const pl = profitAndLoss(accounts, entries, { from, to });
  let prev: ProfitAndLoss | undefined;
  if (compare) {
    const len = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    const pTo = addDays(from, -1);
    prev = profitAndLoss(accounts, entries, { from: addDays(pTo, -(len - 1)), to: pTo });
  }
  const rows: unknown[][] = [];
  for (const s of pl.sections) {
    const ps = prev?.sections.find((x) => x.key === s.key);
    for (const a of sectionAccounts(accounts, s, ps)) {
      const cur = s.rows.find((r) => r.account.id === a.id)?.amount ?? 0;
      rows.push([s.label, a.code, a.name, cur, ...(prev ? [ps?.rows.find((r) => r.account.id === a.id)?.amount ?? 0] : [])]);
    }
    rows.push([s.label, "", `Total ${s.label}`, s.total, ...(prev ? [ps?.total ?? 0] : [])]);
  }
  for (const [label, pick] of PL_SUMMARY) rows.push(["", "", label, pick(pl), ...(prev ? [pick(prev)] : [])]);
  const headers = ["Section", "Code", "Account", `${from} to ${to}`, ...(prev ? [`${prev.from} to ${prev.to}`] : [])];
  const n = pdfNumber;
  return {
    file: `${slug}-profit-loss-${from}-${to}`, csv: { headers, rows }, sheets: [{ name: "Profit & loss", headers, rows, colWidths: [20, 10, 40, 18, 18] }],
    pdf: () => {
      const pdfRows: StatementRow[] = [];
      const amounts = (cur: number, pv?: number): string[] => (prev ? [n(cur), n(pv ?? 0), n(cur - (pv ?? 0))] : [n(cur)]);
      for (const s of pl.sections) {
        const ps = prev?.sections.find((x) => x.key === s.key);
        pdfRows.push({ cells: [s.label], style: "section" });
        const list = sectionAccounts(accounts, s, ps);
        for (const a of list) pdfRows.push({ cells: [`${a.code}  ${a.name}`, ...amounts(s.rows.find((r) => r.account.id === a.id)?.amount ?? 0, ps?.rows.find((r) => r.account.id === a.id)?.amount)], style: "indent" });
        if (list.length === 0) pdfRows.push({ cells: ["No entries"], style: "indent" });
        pdfRows.push({ cells: [`Total ${s.label.toLowerCase()}`, ...amounts(s.total, ps?.total)], style: "total" });
        const sum = PL_SUMMARY.find((x) => x[2] === s.key);
        if (sum) pdfRows.push({ cells: [sum[0], ...amounts(sum[1](pl), prev ? sum[1](prev) : undefined)], style: sum[0] === "Net profit" ? "grand" : "total" });
      }
      const period = `${fmtDate(from)} – ${fmtDate(to)}`;
      return {
        title: "Profit & loss", subtitle: prev ? `${period} · compared with ${fmtDate(prev.from)} – ${fmtDate(prev.to)}` : period,
        columns: [{ label: "Account", width: prev ? 220 : 300, align: "left" }, { label: period, width: 100, align: "right" }, ...(prev ? [{ label: "Previous", width: 100, align: "right" as const }, { label: "Change", width: 100, align: "right" as const }] : [])],
        rows: pdfRows,
      };
    },
  };
}

function plMonthlyOutput(accounts: Account[], entries: JournalEntry[], from: string, to: string, slug: string): ReportOutput {
  const m = profitAndLossMonthly(accounts, entries, { from, to });
  const labels = m.columns.map((c) => c.label);
  const headers = ["Section", "Code", "Account", ...labels, "Total"];
  const rows: unknown[][] = [];
  for (const s of m.sections) {
    for (const r of s.rows) rows.push([s.label, r.account.code, r.account.name, ...r.amounts, r.total]);
    rows.push([s.label, "", `Total ${s.label}`, ...s.totals, s.total]);
    const sum = m.summary.find((x) => x.afterSection === s.key);
    if (sum) rows.push(["", "", sum.label, ...sum.amounts, sum.total]);
  }
  const n = pdfNumber;
  const count = m.columns.length;
  return {
    file: `${slug}-profit-loss-monthly-${m.from}-${m.to}`, csv: { headers, rows },
    sheets: [{ name: "Monthly P&L", headers, rows, colWidths: [20, 10, 36, ...labels.map(() => 14), 16] }],
    pdf: () => {
      const pdfRows: StatementRow[] = [];
      for (const s of m.sections) {
        pdfRows.push({ cells: [s.label], style: "section" });
        for (const r of s.rows) pdfRows.push({ cells: [`${r.account.code}  ${r.account.name}`, ...r.amounts.map((a) => n(a)), n(r.total)], style: "indent" });
        if (s.rows.length === 0) pdfRows.push({ cells: ["No entries"], style: "indent" });
        pdfRows.push({ cells: [`Total ${s.label.toLowerCase()}`, ...s.totals.map((a) => n(a)), n(s.total)], style: "total" });
        const sum = m.summary.find((x) => x.afterSection === s.key);
        if (sum) pdfRows.push({ cells: [sum.label, ...sum.amounts.map((a) => n(a)), n(sum.total)], style: sum.key === "netProfit" ? "grand" : "total" });
      }
      return {
        title: "Profit & loss by month", subtitle: `${fmtDate(m.from)} – ${fmtDate(m.to)} · amounts in IDR`, landscape: true, note: m.note,
        fontSize: count <= 6 ? 9 : count <= 9 ? 8 : count <= 12 ? 7 : 6.5,
        columns: [{ label: "Account", width: count <= 6 ? 200 : 150, align: "left" }, ...labels.map((label) => ({ label, width: 50, align: "right" as const })), { label: "Total", width: 58, align: "right" }],
        rows: pdfRows,
      };
    },
  };
}
