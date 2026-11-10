"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { mapBankRows, type CsvMapping, type DateFormat, type ParsedBankRow } from "@/lib/ledger";
import { fmtNumber } from "@/lib/money";
import { Cols, Dash, TableCard } from "@/components/ui";

type Col = "date" | "description" | "amount" | "debit" | "credit" | "balance" | "reference";
const COLS: Array<{ key: Col; label: string; hint: string }> = [
  { key: "date", label: "Date", hint: "required" }, { key: "description", label: "Description", hint: "required" }, { key: "amount", label: "Amount (signed)", hint: "or debit + credit" },
  { key: "debit", label: "Debit (money out)", hint: "" }, { key: "credit", label: "Credit (money in)", hint: "" }, { key: "balance", label: "Balance", hint: "optional" }, { key: "reference", label: "Reference", hint: "optional" },
];
const GUESS: Record<Col, RegExp> = {
  date: /^(date|tanggal|tgl|value date|transaction date|posting date|postdate|booking date)/i, description: /(description|remarks|narrative|keterangan|details|memo|uraian|transaction description|transaksi)/i,
  amount: /^(amount|jumlah|nominal|mutasi)$/i, debit: /^(debit|debet|debit amount|withdrawal|money out|out|dr)/i, credit: /^(credit|kredit|credit amount|deposit|money in|in|cr)/i, balance: /^(balance|saldo|running balance|closing balance|close balance)/i, reference: /^(ref|reference|no\.? ref|reference no\.?|transaction id|id|trx id|journal)/i,
};

interface Parsed { fileName: string; sheet: string; sheets: string[]; preset: string; presetLabel: string; presets: Array<{ id: string; label: string }>; rows: ParsedBankRow[]; /** Rows per currency when the statement carries one (OCBC multi-currency PDFs, Aspire exports). */ currencies?: Record<string, number>; errors: string[]; headerRow: number; note: string; dropped: number; grid: string[][]; truncated: boolean; warnings?: string[]; pdf?: { pages: number; opening?: number; closing?: number; periodFrom?: string; periodTo?: string; accountNumber?: string } }

/**
 * Statement import: the file (a PDF e-statement from BCA, BNI, BRI, CIMB Niaga or Mandiri; a CSV/XLS/XLSX export from OCBC,
 * Mandiri, BNI, Aspire or any bank) is parsed on the server, the bank format is detected, the rows are previewed here and
 * then stored. Unknown spreadsheet formats fall back to column mapping. A statement that lists several currencies (one OCBC
 * PDF carries the IDR, USD and EUR accounts) comes back with every row tagged: the user picks the currency section, which
 * must be the bank account's own currency; the other sections are imported from their own bank accounts.
 */
export function StatementImport({ entityId, bankAccountId, currency, listHref }: { entityId: string; bankAccountId: string; currency: string; listHref: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<Col, number>>({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1, reference: -1 });
  const [dateFormat, setDateFormat] = useState<DateFormat>("auto");
  const [invert, setInvert] = useState(false);
  const [flipPdf, setFlipPdf] = useState(false);
  const [busy, setBusy] = useState<"parse" | "import" | null>(null);
  const [section, setSection] = useState<string>("");
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parse = async (f: File, preset?: string) => {
    setBusy("parse"); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", f); fd.append("bankAccountId", bankAccountId); if (preset) fd.append("preset", preset);
      const res = await fetch(`/api/books/${entityId}/bank/parse`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) { setError(String(data.error ?? "Could not read the file")); setParsed(null); return; }
      const p = data as Parsed;
      setParsed(p);
      // Multi-currency statement: start on the account's own currency when the file has it, else on the largest section.
      const found = Object.entries(p.currencies ?? {}).sort((a, b) => b[1] - a[1]);
      setSection(found.length ? (found.find(([c]) => c === currency.toUpperCase())?.[0] ?? found[0][0]) : "");
      if (p.preset === "generic") {
        const first = p.grid[0] ?? [];
        const guess: Record<Col, number> = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1, reference: -1 };
        first.forEach((h, i) => { for (const c of COLS) if (guess[c.key] < 0 && GUESS[c.key].test(h.trim())) { guess[c.key] = i; break; } });
        if (guess.date < 0) guess.date = 0;
        if (guess.description < 0) guess.description = first.length > 1 ? 1 : 0;
        setMapping(guess);
      }
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  };
  const onFile = async (f: File | undefined) => { if (!f) return; setFile(f); await parse(f); };
  const onPreset = async (id: string) => { if (file) await parse(file, id); };

  const generic = parsed?.preset === "generic";
  const isPdf = parsed?.sheet === "PDF";
  const grid = parsed?.grid ?? [];
  const header = grid[0] ?? [];
  const body = hasHeader ? grid.slice(1) : grid;
  const colLabel = (i: number) => (hasHeader ? header[i] || `Column ${i + 1}` : `Column ${i + 1}`);
  const csvMapping: CsvMapping = { date: mapping.date, description: mapping.description, amount: mapping.amount >= 0 ? mapping.amount : undefined, debit: mapping.debit >= 0 ? mapping.debit : undefined, credit: mapping.credit >= 0 ? mapping.credit : undefined, balance: mapping.balance >= 0 ? mapping.balance : undefined, reference: mapping.reference >= 0 ? mapping.reference : undefined, dateFormat, invertAmount: invert };
  const genericPreview = useMemo(() => (generic && body.length ? mapBankRows(body, csvMapping) : { rows: [] as ParsedBankRow[], errors: [] as string[] }), [generic, body, csvMapping]);
  const sections = useMemo(() => Object.entries(parsed?.currencies ?? {}).sort((a, b) => b[1] - a[1]), [parsed]);
  const multi = sections.length > 0;
  const sectionMismatch = multi && section !== "" && section !== currency.toUpperCase();
  const rows = useMemo(() => {
    const base = generic ? genericPreview.rows : parsed?.rows ?? [];
    const picked = multi ? base.filter((r) => (r.currency ?? "").toUpperCase() === section) : base;
    return isPdf && flipPdf ? picked.map((r) => ({ ...r, amount: -r.amount })) : picked;
  }, [generic, genericPreview.rows, isPdf, flipPdf, parsed, multi, section]);
  const errors = generic ? genericPreview.errors : parsed?.errors ?? [];
  const ready = parsed && rows.length > 0 && !sectionMismatch && (!generic || (mapping.date >= 0 && mapping.description >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0)));
  const totals = useMemo(() => rows.reduce((t, r) => ({ in: t.in + (r.amount > 0 ? r.amount : 0), out: t.out + (r.amount < 0 ? -r.amount : 0) }), { in: 0, out: 0 }), [rows]);
  const range = rows.length ? `${rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date)} → ${rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date)}` : "";

  const submit = async () => {
    if (!parsed) return;
    setBusy("import"); setError(null);
    try {
      const payload = generic ? { bankAccountId, fileName: parsed.fileName, grid, hasHeader, mapping: csvMapping } : { bankAccountId, fileName: parsed.fileName, rows };
      const res = await fetch(`/api/books/${entityId}/bank/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) { setError(String(data.error ?? "Import failed")); return; }
      setResult(data);
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  };
  const dec = currency === "IDR" ? 0 : 2;
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label className="block"><span className="label">Statement file</span><input type="file" accept=".pdf,application/pdf,.csv,.txt,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => onFile(e.target.files?.[0])} className="input" /></label>
        <p className="-mt-2 text-xs text-ink-500">PDF e-statements from BCA, BNI, BRI, CIMB Niaga and Mandiri are read directly. Exports from OCBC (xlsx), Mandiri Kopra (csv), BNI (xls) and Aspire (xlsx) are recognised too; any other CSV or Excel file can be mapped column by column. A statement that covers several currencies (OCBC) is split by section: pick the one in this account&apos;s currency.</p>
        {busy === "parse" && <p className="text-sm text-ink-500">Reading the file…</p>}
        {parsed && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><span>Bank format</span>
                <select value={parsed.preset} onChange={(e) => onPreset(e.target.value)} className="input !w-auto !py-1">{parsed.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              </label>
              {parsed.sheets.length > 1 && <span className="text-xs text-ink-500">sheet “{parsed.sheet}” of {parsed.sheets.length}</span>}
              {!generic && parsed.note && <span className="text-xs text-ink-500">{parsed.note}</span>}
              {isPdf && rows.length > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={flipPdf} onChange={(e) => setFlipPdf(e.target.checked)} className="checkbox" /> Flip all signs (if money in and out look swapped)</label>}
            </div>
            {multi && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2"><span>Currency section</span>
                  <select value={section} onChange={(e) => setSection(e.target.value)} className="input !w-auto !py-1">{sections.map(([c, n]) => <option key={c} value={c}>{c} · {n} line{n === 1 ? "" : "s"}</option>)}</select>
                </label>
                <span className="text-xs text-ink-500">This statement lists {sections.length} currenc{sections.length === 1 ? "y" : "ies"}; only the section in this account&apos;s currency ({currency}) can be imported here.</span>
              </div>
            )}
            {sectionMismatch && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">These are {section} lines, but this bank account is kept in {currency}. Open the {section} bank account from <Link href={`/books/${entityId}/bank`} className="font-semibold underline">Bank</Link> and import the same file there; it will start on the {section} section.</div>}
            {(parsed.warnings?.length ?? 0) > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">{parsed.warnings!.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}{parsed.warnings!.length > 5 && <li>… and {parsed.warnings!.length - 5} more</li>}</ul>
            )}
            {generic && (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="checkbox" /> First row is a header</label>
                  <label className="flex items-center gap-2"><span>Date format</span><select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)} className="input !w-auto !py-1">{["auto", "dd/mm/yyyy", "yyyy-mm-dd", "mm/dd/yyyy"].map((f) => <option key={f}>{f}</option>)}</select></label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="checkbox" /> Flip sign of the amount column</label>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  {COLS.map((c) => (
                    <label key={c.key} className="block"><span className="label">{c.label} <span className="font-normal text-ink-500">{c.hint}</span></span>
                      <select value={mapping[c.key]} onChange={(e) => setMapping({ ...mapping, [c.key]: Number(e.target.value) })} className="input !py-1">
                        <option value={-1}>— not used —</option>
                        {header.map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-ink-500">
              {rows.length} transaction{rows.length === 1 ? "" : "s"}{range && ` · ${range}`} · in {fmtNumber(totals.in, dec)} · out {fmtNumber(totals.out, dec)}
              {errors.length > 0 && ` · ${errors.length} line${errors.length === 1 ? "" : "s"} skipped`}{multi && ` · ${sections.filter(([c]) => c !== section).reduce((s, [, n]) => s + n, 0)} line${sections.filter(([c]) => c !== section).reduce((s, [, n]) => s + n, 0) === 1 ? "" : "s"} in other currencies left out`}.
              Lines already imported (same date, amount and description) are skipped automatically.
            </p>
          </>
        )}
      </div>
      {parsed && rows.length > 0 && (
        <TableCard footer={rows.length > 10 && <span>… and {rows.length - 10} more</span>}>
          <table className="table table-data min-w-[720px]">
            <Cols widths={[110, undefined, 120, 130, 130]} />
            <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="num">Amount ({currency})</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{r.date}</td>
                  <td><span className="cell" title={r.description}>{r.description}</span></td>
                  <td>{r.reference ? <span className="cell text-xs" title={r.reference}>{r.reference}</span> : <Dash />}</td>
                  <td className={`num ${r.amount < 0 ? "text-red-700" : "text-green-700"}`}><span className="money">{fmtNumber(r.amount, dec)}</span></td>
                  <td className="num text-ink-500">{r.balance !== undefined ? <span className="money">{fmtNumber(r.balance, dec)}</span> : <Dash />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
      {parsed && rows.length === 0 && !busy && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No transaction could be read with the “{parsed.presetLabel}” format. Try another bank format above, or “Generic” to map the columns yourself.</div>}
      {errors.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}{errors.length > 5 && <p>… {errors.length - 5} more</p>}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {result ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Imported {result.inserted} line{result.inserted === 1 ? "" : "s"}, skipped {result.skipped} duplicate{result.skipped === 1 ? "" : "s"}{result.errors.length ? `, ${result.errors.length} unreadable` : ""}. <Link href={`${listHref}?status=unmatched`} className="font-semibold underline">Reconcile now →</Link>
        </div>
      ) : <button type="button" className="btn-primary" disabled={!ready || busy !== null} onClick={submit}>{busy === "import" ? "Importing…" : `Import ${rows.length} line${rows.length === 1 ? "" : "s"}`}</button>}
    </div>
  );
}
