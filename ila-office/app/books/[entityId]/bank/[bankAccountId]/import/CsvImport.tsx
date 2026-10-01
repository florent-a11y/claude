"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCSV } from "@/lib/csv";
import { mapBankRows, type CsvMapping, type DateFormat } from "@/lib/ledger";
import { fmtNumber } from "@/lib/money";

type Col = "date" | "description" | "amount" | "debit" | "credit" | "balance" | "reference";
const COLS: Array<{ key: Col; label: string; hint: string }> = [
  { key: "date", label: "Date", hint: "required" }, { key: "description", label: "Description", hint: "required" }, { key: "amount", label: "Amount (signed)", hint: "or debit + credit" },
  { key: "debit", label: "Debit (money out)", hint: "" }, { key: "credit", label: "Credit (money in)", hint: "" }, { key: "balance", label: "Balance", hint: "optional" }, { key: "reference", label: "Reference", hint: "optional" },
];
const GUESS: Record<Col, RegExp> = {
  date: /^(date|tanggal|tgl|value date|transaction date|posting date|booking date)/i, description: /(description|remarks|narrative|keterangan|details|memo|uraian|transaction description|transaksi)/i,
  amount: /^(amount|jumlah|nominal|mutasi)$/i, debit: /^(debit|debet|withdrawal|money out|out|dr)/i, credit: /^(credit|kredit|deposit|money in|in|cr)/i, balance: /^(balance|saldo|running balance|closing balance)/i, reference: /^(ref|reference|no\.? ref|transaction id|id|trx id)/i,
};

/** Reads a bank CSV in the browser, lets the user map columns and preview, then posts rows to the import API. */
export function CsvImport({ entityId, bankAccountId, currency, listHref }: { entityId: string; bankAccountId: string; currency: string; listHref: string }) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<Col, number>>({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1, reference: -1 });
  const [dateFormat, setDateFormat] = useState<DateFormat>("dd/mm/yyyy");
  const [invert, setInvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => (text ? parseCSV(text) : []), [text]);
  const header = rows[0] ?? [];
  const body = hasHeader ? rows.slice(1) : rows;
  const colLabel = (i: number) => (hasHeader ? header[i] || `Column ${i + 1}` : `Column ${i + 1}`);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const t = await f.text();
    setFileName(f.name); setText(t); setResult(null); setError(null);
    const first = parseCSV(t)[0] ?? [];
    const guess: Record<Col, number> = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1, reference: -1 };
    first.forEach((h, i) => { for (const c of COLS) if (guess[c.key] < 0 && GUESS[c.key].test(h.trim())) { guess[c.key] = i; break; } });
    if (guess.date < 0) guess.date = 0;
    if (guess.description < 0) guess.description = first.length > 1 ? 1 : 0;
    const sample = parseCSV(t)[1]?.[guess.date] ?? "";
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) setDateFormat("yyyy-mm-dd");
    setMapping(guess);
  };
  const csvMapping: CsvMapping = { date: mapping.date, description: mapping.description, amount: mapping.amount >= 0 ? mapping.amount : undefined, debit: mapping.debit >= 0 ? mapping.debit : undefined, credit: mapping.credit >= 0 ? mapping.credit : undefined, balance: mapping.balance >= 0 ? mapping.balance : undefined, reference: mapping.reference >= 0 ? mapping.reference : undefined, dateFormat, invertAmount: invert };
  const preview = useMemo(() => (body.length ? mapBankRows(body, csvMapping) : { rows: [], errors: [] }), [body, csvMapping]);
  const ready = text && mapping.date >= 0 && mapping.description >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0) && preview.rows.length > 0;
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/books/${entityId}/bank/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bankAccountId, fileName, text, hasHeader, mapping: csvMapping }) });
      const data = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) { setError(String(data.error ?? "Import failed")); return; }
      setResult(data);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const dec = currency === "IDR" ? 0 : 2;
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label className="block"><span className="label">Statement CSV (OCBC, Mandiri, BNI, Aspire, Xendit…)</span><input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} className="input" /></label>
        {text && (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="checkbox" /> First row is a header</label>
              <label className="flex items-center gap-2"><span>Date format</span><select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)} className="input !w-auto !py-1">{["dd/mm/yyyy", "yyyy-mm-dd", "mm/dd/yyyy"].map((f) => <option key={f}>{f}</option>)}</select></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="checkbox" /> Flip sign of the amount column (statement shows outflows as positive)</label>
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
            <p className="text-xs text-ink-500">{rows.length} rows read · {preview.rows.length} parsed · {preview.errors.length} skipped. Duplicates (same date, amount and description already imported) are skipped automatically.</p>
          </>
        )}
      </div>
      {text && preview.rows.length > 0 && (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Date</th><th>Description</th><th>Ref</th><th className="num">Amount ({currency})</th><th className="num">Balance</th></tr></thead>
            <tbody>{preview.rows.slice(0, 8).map((r, i) => <tr key={i}><td className="pl-4">{r.date}</td><td className="max-w-md truncate">{r.description}</td><td className="text-xs">{r.reference ?? ""}</td><td className={`num ${r.amount < 0 ? "text-red-700" : "text-green-700"}`}>{fmtNumber(r.amount, dec)}</td><td className="num text-xs">{r.balance !== undefined ? fmtNumber(r.balance, dec) : ""}</td></tr>)}</tbody>
          </table>
          {preview.rows.length > 8 && <p className="p-3 text-xs text-ink-500">… and {preview.rows.length - 8} more</p>}
        </div>
      )}
      {preview.errors.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{preview.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}{preview.errors.length > 5 && <p>… {preview.errors.length - 5} more</p>}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {result ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Imported {result.inserted} line{result.inserted === 1 ? "" : "s"}, skipped {result.skipped} duplicate{result.skipped === 1 ? "" : "s"}{result.errors.length ? `, ${result.errors.length} unreadable` : ""}. <Link href={`${listHref}?status=unmatched`} className="font-semibold underline">Reconcile now →</Link>
        </div>
      ) : <button type="button" className="btn-primary" disabled={!ready || busy} onClick={submit}>{busy ? "Importing…" : `Import ${preview.rows.length} line${preview.rows.length === 1 ? "" : "s"}`}</button>}
    </div>
  );
}
