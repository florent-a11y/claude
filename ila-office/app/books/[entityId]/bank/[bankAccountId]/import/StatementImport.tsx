"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { mapBankRows, type CsvMapping, type DateFormat, type ParsedBankRow } from "@/lib/ledger";
import { columnDecimals, fmtNumber } from "@/lib/money";
import { NEW_BANK, NEW_GL, SKIP_SECTION, SWITCH_PREFIX, planSections, suggestBankName, suggestGlAccount, type GlOption, type SectionBank } from "@/lib/bank-sections";
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

interface Parsed { fileName: string; sheet: string; sheets: string[]; preset: string; presetLabel: string; presets: Array<{ id: string; label: string }>; rows: ParsedBankRow[]; /** Rows per currency when the statement carries one (OCBC multi-currency PDFs, Aspire exports). */ currencies?: Record<string, number>; errors: string[]; headerRow: number; note: string; dropped: number; grid: string[][]; truncated: boolean; warnings?: string[]; /** PDF only: what was read from each currency section and whether its balances add up. */ coverage?: Array<{ currency?: string; ok: boolean; text: string }>; pdf?: { pages: number; opening?: number; closing?: number; periodFrom?: string; periodTo?: string; accountNumber?: string } }

/**
 * Statement import: the file (a PDF e-statement from BCA, BNI, BRI, CIMB Niaga, Mandiri or OCBC; a CSV/XLS/XLSX export from OCBC,
 * Mandiri, BNI, Aspire or any bank) is parsed on the server, the bank format is detected, the rows are previewed here and
 * then stored. Unknown spreadsheet formats fall back to column mapping. A statement that lists several currencies (one OCBC
 * PDF carries the IDR, USD and EUR accounts) comes back with every row tagged, and one import stores them all: each
 * currency section goes to the bank account kept in that currency (rules in lib/bank-sections.ts). The account the
 * screen was opened from takes its own currency; another currency goes to the entity's account in it, which can be
 * created here when there is none, or is left out. The preview shows one section at a time.
 */
interface SectionResult { currency: string; bankId: string; bankName: string; inserted: number; skipped: number; updated?: number; errors: string[] }

export function StatementImport({ entityId, bankAccountId, currency, bankName, listHref, banks, glOptions }: {
  entityId: string; bankAccountId: string; currency: string; bankName: string; listHref: string;
  /** Active bank accounts of the entity (destinations of the other currency sections). */ banks: SectionBank[];
  /** Bank and cash GL accounts no bank account uses yet, plus NEW_GL, for an account created here. */ glOptions: GlOption[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<Col, number>>({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1, reference: -1 });
  const [dateFormat, setDateFormat] = useState<DateFormat>("auto");
  const [invert, setInvert] = useState(false);
  const [flipPdf, setFlipPdf] = useState(false);
  const [busy, setBusy] = useState<"parse" | "import" | null>(null);
  const [section, setSection] = useState<string>("");
  const [results, setResults] = useState<SectionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Multi-currency statements: where each section goes (a bank account id, NEW_BANK or SKIP_SECTION), the account to
  // create for a currency without one, and the accounts known so far (those created here are added).
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [newBank, setNewBank] = useState<Record<string, { name: string; gl: string }>>({});
  const [knownBanks, setKnownBanks] = useState<SectionBank[]>(banks);
  // A locked e-statement: the password is typed here, sent with the file for that one read and kept nowhere.
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const opened: SectionBank = useMemo(() => ({ id: bankAccountId, name: bankName, currency, active: true }), [bankAccountId, bankName, currency]);

  const parse = async (f: File, preset?: string, pw = password) => {
    setBusy("parse"); setError(null); setResults(null);
    try {
      const fd = new FormData();
      fd.append("file", f); fd.append("bankAccountId", bankAccountId); if (preset) fd.append("preset", preset); if (pw) fd.append("password", pw);
      const res = await fetch(`/api/books/${entityId}/bank/parse`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) { setError(String(data.error ?? "Could not read the file")); setNeedsPassword(Boolean(data.needsPassword)); setParsed(null); return; }
      setNeedsPassword(false);
      const p = data as Parsed;
      setParsed(p);
      // Statement tagged by currency: every section gets its default destination; the preview starts on the account's
      // own currency when the file has it, else on the largest section.
      const sectionsFound = planSections(p.currencies ?? {}, knownBanks, opened);
      setTargets(Object.fromEntries(sectionsFound.map((x) => [x.currency, x.target])));
      setNewBank(Object.fromEntries(sectionsFound.map((x) => [x.currency, { name: suggestBankName(bankName, currency, x.currency), gl: suggestGlAccount(glOptions, x.currency) }])));
      setSection(sectionsFound[0]?.currency ?? "");
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
  const onFile = async (f: File | undefined) => { if (!f) return; setFile(f); setPassword(""); setNeedsPassword(false); await parse(f, undefined, ""); };
  const onPreset = async (id: string) => { if (file) await parse(file, id); };

  const generic = parsed?.preset === "generic";
  const isPdf = parsed?.sheet === "PDF";
  const grid = parsed?.grid ?? [];
  const header = grid[0] ?? [];
  const body = hasHeader ? grid.slice(1) : grid;
  const colLabel = (i: number) => (hasHeader ? header[i] || `Column ${i + 1}` : `Column ${i + 1}`);
  const csvMapping: CsvMapping = { date: mapping.date, description: mapping.description, amount: mapping.amount >= 0 ? mapping.amount : undefined, debit: mapping.debit >= 0 ? mapping.debit : undefined, credit: mapping.credit >= 0 ? mapping.credit : undefined, balance: mapping.balance >= 0 ? mapping.balance : undefined, reference: mapping.reference >= 0 ? mapping.reference : undefined, dateFormat, invertAmount: invert };
  const genericPreview = useMemo(() => (generic && body.length ? mapBankRows(body, csvMapping) : { rows: [] as ParsedBankRow[], errors: [] as string[] }), [generic, body, csvMapping]);
  const plan = useMemo(() => planSections(parsed?.currencies ?? {}, knownBanks, opened), [parsed, knownBanks, opened]);
  const multi = plan.length > 0;
  /** The lines of one currency section (every line for a statement that is not tagged), with the sign flip applied. */
  const rowsOf = (code: string): ParsedBankRow[] => {
    const base = generic ? genericPreview.rows : parsed?.rows ?? [];
    const picked = multi ? base.filter((r) => (r.currency ?? "").toUpperCase() === code) : base;
    return isPdf && flipPdf ? picked.map((r) => ({ ...r, amount: -r.amount })) : picked;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => rowsOf(section), [generic, genericPreview.rows, isPdf, flipPdf, parsed, multi, section]);
  const errors = generic ? genericPreview.errors : parsed?.errors ?? [];
  // What the one import will store: every section that has a destination, and the accounts to create first.
  const going = plan.filter((x) => (targets[x.currency] ?? "") !== SKIP_SECTION);
  const undecided = plan.filter((x) => !(targets[x.currency] ?? "") || (targets[x.currency] === NEW_BANK && !(newBank[x.currency]?.name ?? "").trim()));
  const goingLines = going.reduce((n, x) => n + x.lines, 0);
  const destinations = new Set(going.map((x) => (targets[x.currency] === NEW_BANK ? `new:${x.currency}` : targets[x.currency]))).size;
  const ready = parsed && (multi ? going.length > 0 && undecided.length === 0 : rows.length > 0) && (!generic || (mapping.date >= 0 && mapping.description >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0)));
  const totals = useMemo(() => rows.reduce((t, r) => ({ in: t.in + (r.amount > 0 ? r.amount : 0), out: t.out + (r.amount < 0 ? -r.amount : 0) }), { in: 0, out: 0 }), [rows]);
  const range = rows.length ? `${rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date)} → ${rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date)}` : "";

  const post = async (url: string, body: unknown, method = "POST") => {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: res.statusText }));
    return { ok: res.ok, data };
  };
  const submit = async () => {
    if (!parsed) return;
    setBusy("import"); setError(null);
    try {
      if (!multi) {
        const payload = generic ? { bankAccountId, fileName: parsed.fileName, grid, hasHeader, mapping: csvMapping } : { bankAccountId, fileName: parsed.fileName, rows };
        const { ok, data } = await post(`/api/books/${entityId}/bank/import`, payload);
        if (!ok) { setError(String(data.error ?? "Import failed")); return; }
        setResults([{ currency: currency.toUpperCase(), bankId: bankAccountId, bankName, ...data }]);
        return;
      }
      // One section after the other: the account is created first when the currency has none, then its lines are
      // stored. Each step is safe to repeat (an account created here is remembered, lines already stored are skipped),
      // so after an error the button simply finishes what is left.
      const done: SectionResult[] = [];
      let banksNow = knownBanks;
      const targetsNow = { ...targets };
      let failed: string | null = null;
      for (const x of going) {
        let target = targetsNow[x.currency];
        let name = banksNow.find((b) => b.id === target)?.name ?? (target === bankAccountId ? bankName : "");
        if (target === NEW_BANK) {
          const nb = newBank[x.currency];
          const made = await post(`/api/books/${entityId}/bank/accounts`, { name: nb.name.trim(), currency: x.currency, accountId: nb.gl || NEW_GL });
          if (!made.ok) { failed = `${x.currency}: ${String(made.data.error ?? "the bank account could not be created")}`; break; }
          target = String(made.data.id); name = String(made.data.name);
          banksNow = [...banksNow, { id: target, name, currency: x.currency, active: true, lines: 0 }];
          targetsNow[x.currency] = target;
        } else if (target.startsWith(SWITCH_PREFIX)) {
          // An account named for this currency but saved in another one: its currency is corrected first.
          const id = target.slice(SWITCH_PREFIX.length);
          const fixed = await post(`/api/books/${entityId}/bank/accounts`, { id, currency: x.currency }, "PATCH");
          if (!fixed.ok) { failed = `${x.currency}: ${String(fixed.data.error ?? "the bank account could not be switched")}`; break; }
          target = id; name = String(fixed.data.name);
          banksNow = banksNow.map((b) => (b.id === id ? { ...b, currency: x.currency } : b));
          targetsNow[x.currency] = id;
        }
        const { ok, data } = await post(`/api/books/${entityId}/bank/import`, { bankAccountId: target, fileName: parsed.fileName, rows: rowsOf(x.currency) });
        if (!ok) { failed = `${x.currency}: ${String(data.error ?? "Import failed")}`; break; }
        done.push({ currency: x.currency, bankId: target, bankName: name, inserted: data.inserted, skipped: data.skipped, updated: data.updated, errors: data.errors ?? [] });
      }
      setKnownBanks(banksNow); setTargets(targetsNow);
      if (done.length > 0 || !failed) setResults(done);
      if (failed) setError(`${failed}${done.length ? " The sections above it are imported; press the button again to finish." : ""}`);
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  };
  // The preview follows the section shown; IDR statements carry cents and show them as soon as one amount or balance has any.
  const shownCurrency = multi && section ? section : currency;
  const dec = columnDecimals(shownCurrency, [...rows.flatMap((r) => [r.amount, r.balance]), totals.in, totals.out]);
  const setTarget = (code: string, value: string) => { setTargets((t) => ({ ...t, [code]: value })); setResults(null); };
  const setNew = (code: string, patch: Partial<{ name: string; gl: string }>) => setNewBank((n) => ({ ...n, [code]: { name: n[code]?.name ?? "", gl: n[code]?.gl ?? NEW_GL, ...patch } }));
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label className="block"><span className="label">Statement file</span><input type="file" accept=".pdf,application/pdf,.csv,.txt,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => onFile(e.target.files?.[0])} className="input" /></label>
        <p className="-mt-2 text-xs text-ink-500">PDF e-statements from BCA, BNI, BRI, CIMB Niaga, Mandiri and OCBC are read directly. Exports from OCBC (xlsx), Mandiri Kopra (csv), BNI (xls) and Aspire (xlsx) are recognised too; any other CSV or Excel file can be mapped column by column. A statement that covers several currencies (OCBC) is imported in one go: each currency goes to its own bank account.</p>
        {busy === "parse" && <p className="text-sm text-ink-500">Reading the file…</p>}
        {needsPassword && file && (
          <form className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3" onSubmit={(e) => { e.preventDefault(); void parse(file); }}>
            <label className="block"><span className="label">Password of this PDF</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input !w-64" autoComplete="off" autoFocus aria-label="Password of the statement PDF" /></label>
            <button type="submit" className="btn-secondary" disabled={!password || busy !== null}>Open the statement</button>
            <p className="w-full text-xs text-amber-900">Banks often lock the e-statements they e-mail; the password is given in that e-mail or by the bank. It is used to read this file once and is not stored.</p>
          </form>
        )}
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
            {isPdf && (parsed.coverage?.length ?? 0) > 0 && <p className="text-xs text-ink-500">{parsed.coverage!.map((c, i) => <span key={i}>{i > 0 && " · "}<span className={c.ok ? undefined : "font-medium text-amber-800"}>{c.text}</span></span>)}</p>}
            {multi && (
              <div className="rounded-lg border border-slate-200">
                <table className="table table-data">
                  <Cols widths={[110, 120, undefined]} />
                  <thead><tr><th>Currency</th><th className="num">Lines read</th><th>Import into</th></tr></thead>
                  <tbody>
                    {plan.map((x) => {
                      const target = targets[x.currency] ?? "";
                      const nb = newBank[x.currency] ?? { name: "", gl: NEW_GL };
                      return (
                        <tr key={x.currency}>
                          <td className="font-medium">{x.currency}</td>
                          <td className="num">{x.lines}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <select value={target} onChange={(e) => setTarget(x.currency, e.target.value)} className="input !w-auto !py-1" aria-label={`Where the ${x.currency} lines go`}>
                                {target === "" && <option value="">— choose the {x.currency} account —</option>}
                                {x.candidates.map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === bankAccountId ? " (this account)" : ""}</option>)}
                                {x.convertible.map((b) => <option key={b.id} value={`${SWITCH_PREFIX}${b.id}`}>{b.name} (set to {b.currency} today: switch it to {x.currency})</option>)}
                                <option value={NEW_BANK}>Create {/^[AEIOU]/.test(x.currency) ? "an" : "a"} {x.currency} bank account…</option>
                                <option value={SKIP_SECTION}>Do not import these lines</option>
                              </select>
                              {target === NEW_BANK && (
                                <>
                                  <input value={nb.name} onChange={(e) => setNew(x.currency, { name: e.target.value })} className="input !w-56 !py-1" placeholder={`Name, e.g. OCBC ${x.currency}`} aria-label={`Name of the new ${x.currency} bank account`} />
                                  <select value={nb.gl} onChange={(e) => setNew(x.currency, { gl: e.target.value })} className="input !w-64 !py-1" aria-label={`GL account of the new ${x.currency} bank account`}>
                                    {glOptions.map((g) => <option key={g.id} value={g.id}>{g.id === NEW_GL ? g.name : `${g.code} · ${g.name}`}</option>)}
                                  </select>
                                </>
                              )}
                            </div>
                            {target === NEW_BANK && <p className="mt-1 text-xs text-ink-500">This entity has no {x.currency} bank account{x.candidates.length ? " selected" : " yet"}: it is created with the import. Pick the GL account that already carries this account&apos;s balance when there is one (a migrated chart usually has it); otherwise a new one is created.</p>}
                            {target.startsWith(SWITCH_PREFIX) && <p className="mt-1 text-xs text-ink-500">This account is named for {x.currency} but was saved with another currency and holds no statement line yet: the import sets its currency to {x.currency}, then stores the lines in it.</p>}
                            {target === "" && <p className="mt-1 text-xs text-amber-800">Several accounts could take the {x.currency} lines: choose the one this statement belongs to.</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {multi && plan.length > 1 && (
              <label className="flex items-center gap-2 text-sm"><span>Preview</span>
                <select value={section} onChange={(e) => setSection(e.target.value)} className="input !w-auto !py-1">{plan.map((x) => <option key={x.currency} value={x.currency}>{x.currency} · {x.lines} line{x.lines === 1 ? "" : "s"}</option>)}</select>
              </label>
            )}
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
              {errors.length > 0 && ` · ${errors.length} line${errors.length === 1 ? "" : "s"} skipped`}{multi && plan.length > 1 && ` (${section} section; the import stores ${goingLines} line${goingLines === 1 ? "" : "s"} in ${going.length} currenc${going.length === 1 ? "y" : "ies"})`}.
              Lines already imported (same date, amount and description, or same date and running balance) are skipped automatically.
            </p>
          </>
        )}
      </div>
      {parsed && rows.length > 0 && (
        <TableCard footer={rows.length > 10 && <span>… and {rows.length - 10} more</span>}>
          <table className="table table-data min-w-[720px]">
            <Cols widths={[110, undefined, 120, 130, 130]} />
            <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="num">Amount ({shownCurrency})</th><th className="num">Balance</th></tr></thead>
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
      {results && results.length > 0 && (
        <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {results.map((r) => (
            <p key={r.currency}>
              {results.length > 1 || multi ? <><span className="font-medium">{r.currency}</span> into {r.bankName}: </> : null}imported {r.inserted} line{r.inserted === 1 ? "" : "s"}, skipped {r.skipped} already imported{r.updated ? `, ${r.updated} of them corrected to the statement's exact amount (cents restored)` : ""}{r.errors.length ? `, ${r.errors.length} unreadable` : ""}. <Link href={r.bankId === bankAccountId ? `${listHref}?status=unmatched` : `/books/${entityId}/bank/${r.bankId}?status=unmatched`} className="font-semibold underline">Reconcile {results.length > 1 ? r.currency : "now"} →</Link>
            </p>
          ))}
        </div>
      )}
      {(!results || results.length === 0 || error) && (
        <button type="button" className="btn-primary" disabled={!ready || busy !== null} onClick={submit}>
          {busy === "import" ? "Importing…" : multi ? `Import ${goingLines} line${goingLines === 1 ? "" : "s"}${destinations > 1 ? ` into ${destinations} bank accounts` : ""}` : `Import ${rows.length} line${rows.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
