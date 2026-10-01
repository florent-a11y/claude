import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { csvResponse } from "@/lib/csv";
import { entityAccounts, entityEntries } from "@/lib/books";
import { trialBalance, profitAndLoss, balanceSheet, generalLedger, arAging, apAging, fiscalYearStartOf, AGING_BUCKETS, entryTotal } from "@/lib/ledger";
import { addDays, todayISO } from "@/lib/dates";
import { naturalBalance, accountBalances } from "@/lib/balances";

export const runtime = "nodejs";

/**
 * GET /api/books/:entityId/reports/:report?… → CSV download. Reports: trial-balance (asOf), profit-loss (from, to,
 * compare), balance-sheet (asOf), general-ledger (accountId, from, to), ar-aging (asOf), ap-aging (asOf), accounts, journal (from, to).
 */
export async function GET(req: Request, ctx: { params: Promise<{ entityId: string; report: string }> }) {
  const user = await guard("read");
  if (user instanceof Response) return user;
  const { entityId, report } = await ctx.params;
  const entity = await db.get("entities", entityId);
  if (!entity) return new Response("Entity not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const today = todayISO();
  const asOf = q.get("asOf") ?? q.get("to") ?? today;
  const to = q.get("to") ?? asOf;
  const from = q.get("from") ?? fiscalYearStartOf(to, entity.fiscalYearStartMonth);
  const slug = entity.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const [accounts, entries] = await Promise.all([entityAccounts(entityId), entityEntries(entityId)]);

  switch (report) {
    case "trial-balance": {
      const tb = trialBalance(accounts, entries, asOf);
      return csvResponse(["Code", "Account", "Type", "Debit", "Credit"], [...tb.rows.map((r) => [r.account.code, r.account.name, r.account.type, r.debit, r.credit]), ["", "Total", "", tb.totalDebit, tb.totalCredit]], `${slug}-trial-balance-${asOf}.csv`);
    }
    case "profit-loss": {
      const pl = profitAndLoss(accounts, entries, { from, to });
      const compare = q.get("compare") === "1";
      let prev: ReturnType<typeof profitAndLoss> | undefined;
      if (compare) {
        const len = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
        const pTo = addDays(from, -1);
        prev = profitAndLoss(accounts, entries, { from: addDays(pTo, -(len - 1)), to: pTo });
      }
      const rows: unknown[][] = [];
      for (const s of pl.sections) {
        const ps = prev?.sections.find((x) => x.key === s.key);
        const ids = new Set([...s.rows.map((r) => r.account.id), ...(ps?.rows.map((r) => r.account.id) ?? [])]);
        for (const a of accounts.filter((x) => ids.has(x.id)).sort((x, y) => x.code.localeCompare(y.code))) {
          const cur = s.rows.find((r) => r.account.id === a.id)?.amount ?? 0;
          rows.push([s.label, a.code, a.name, cur, ...(prev ? [ps?.rows.find((r) => r.account.id === a.id)?.amount ?? 0] : [])]);
        }
        rows.push([s.label, "", `Total ${s.label}`, s.total, ...(prev ? [ps?.total ?? 0] : [])]);
      }
      rows.push(["", "", "Gross profit", pl.grossProfit, ...(prev ? [prev.grossProfit] : [])], ["", "", "Operating profit", pl.operatingProfit, ...(prev ? [prev.operatingProfit] : [])], ["", "", "Profit before tax", pl.profitBeforeTax, ...(prev ? [prev.profitBeforeTax] : [])], ["", "", "Net profit", pl.netProfit, ...(prev ? [prev.netProfit] : [])]);
      return csvResponse(["Section", "Code", "Account", `${from} to ${to}`, ...(prev ? [`${prev.from} to ${prev.to}`] : [])], rows, `${slug}-profit-loss-${from}-${to}.csv`);
    }
    case "balance-sheet": {
      const bs = balanceSheet(accounts, entries, asOf, entity.fiscalYearStartMonth);
      const rows: unknown[][] = [];
      for (const [group, sections, total] of [["Assets", bs.assets, bs.totalAssets], ["Liabilities", bs.liabilities, bs.totalLiabilities], ["Equity", bs.equity, bs.totalEquity]] as const) {
        for (const s of sections) { for (const r of s.rows) rows.push([group, s.label, r.account.code, r.account.name, r.amount]); rows.push([group, s.label, "", `Total ${s.label}`, s.total]); }
        rows.push([group, "", "", `Total ${group}`, total]);
      }
      return csvResponse(["Group", "Section", "Code", "Account", `As of ${asOf}`], rows, `${slug}-balance-sheet-${asOf}.csv`);
    }
    case "general-ledger": {
      const account = accounts.find((a) => a.id === q.get("accountId"));
      if (!account) return new Response("accountId required", { status: 400 });
      const gl = generalLedger(account, entries, { from, to });
      return csvResponse(["Date", "Entry", "Memo", "Description", "Counterparty", "Debit", "Credit", "Balance"], [["", "", `Opening balance ${from}`, "", "", "", "", gl.opening], ...gl.rows.map((r) => [r.date, r.number, r.memo, r.description ?? "", r.counterpartyName ?? "", r.debit, r.credit, r.balance]), ["", "", `Closing balance ${to}`, "", "", gl.totalDebit, gl.totalCredit, gl.closing]], `${slug}-gl-${account.code}-${from}-${to}.csv`);
    }
    case "ar-aging":
    case "ap-aging": {
      const r = report === "ar-aging" ? arAging(await db.list("invoices", { where: { entityId } }), asOf) : apAging(await db.list("bills", { where: { entityId } }), asOf);
      const rows: unknown[][] = r.rows.map((x) => [x.name, x.number, x.date, x.dueDate, x.daysOverdue, x.bucket, x.currency, x.outstanding, x.outstandingIDR]);
      rows.push([], ["Summary", ...AGING_BUCKETS, "Total"], ...r.groups.map((g) => [g.name, ...AGING_BUCKETS.map((k) => g.buckets[k]), g.total]), ["Total", ...AGING_BUCKETS.map((k) => r.totals[k]), r.total]);
      return csvResponse([report === "ar-aging" ? "Customer" : "Vendor", "Document", "Date", "Due", "Days overdue", "Bucket", "Currency", "Outstanding", "Outstanding IDR"], rows, `${slug}-${report}-${asOf}.csv`);
    }
    case "accounts": {
      const bal = accountBalances(entries);
      return csvResponse(["Code", "Name", "Nama", "Type", "Subtype", "Normal", "Tax tag", "Deductible", "System", "Active", "Balance"], [...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => [a.code, a.name, a.nameId ?? "", a.type, a.subtype, a.normalBalance, a.taxTag ?? "", a.deductible === undefined ? "" : a.deductible ? "yes" : "no", a.isSystem ? "yes" : "no", a.active ? "yes" : "no", naturalBalance(a, bal.get(a.id))]), `${slug}-accounts.csv`);
    }
    case "journal": {
      const all = await db.list("journal_entries", { where: (e) => e.entityId === entityId && e.date >= from && e.date <= to, orderBy: "date" });
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const rows: unknown[][] = [];
      for (const e of all) for (const l of e.lines) rows.push([e.number, e.date, e.period, e.status, e.source, e.memo, entryTotal(e), l.accountCode, byId.get(l.accountId)?.name ?? "", l.description ?? "", l.counterpartyName ?? "", l.debit, l.credit, l.currency ?? "", l.fxAmount ?? "", l.fxRate ?? ""]);
      return csvResponse(["Entry", "Date", "Period", "Status", "Source", "Memo", "Entry total", "Account code", "Account", "Line description", "Counterparty", "Debit", "Credit", "Currency", "FX amount", "FX rate"], rows, `${slug}-journal-${from}-${to}.csv`);
    }
    default:
      return new Response("Unknown report", { status: 404 });
  }
}
