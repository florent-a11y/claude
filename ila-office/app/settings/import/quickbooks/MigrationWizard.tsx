"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtNumber } from "@/lib/money";
import { DATE_FORMAT_LABELS, type DateFormat, type QboReportKind } from "@/lib/importers";
import { MIGRATION_STATE_LABELS, QBO_KIND_LABELS, QBO_MAX_FILE_BYTES, QBO_MAX_ROWS, QBO_TOO_LARGE, uploadBatches, type MigrationState, type TbCheck } from "@/lib/qbo-migration";
import type { MigrationResult, PlanView, WizardDraft, WizardFile, WizardOptions } from "@/lib/qbo-migration-services";
import type { QboMigration } from "@/lib/types";
import { Badge, Card, Notice, type Tone } from "@/components/ui";

/**
 * The migration wizard. Everything happens through POST /api/settings/import/quickbooks: the files go up in several
 * requests of at most 4 MB (one progress line per file), stay on the server with the pending migration, are planned
 * as one dry run and imported in one go. The server keeps the uploads, so the page can be left and reopened before
 * the import. Below the wizard: every company's migration status, with the check against QuickBooks on demand.
 */

export interface TargetOption { key: string; label: string; hasBooks: boolean; isOwn: boolean }
export interface CompanyStatus {
  entityId: string; name: string; isOwn: boolean; state: MigrationState;
  files: QboMigration["files"]; counts?: QboMigration["counts"]; lastCheck?: QboMigration["lastCheck"]; trialBalance?: { fileName: string; asOf: string }; updatedAt?: string;
}

const API = "/api/settings/import/quickbooks";
const KINDS = Object.keys(QBO_KIND_LABELS) as QboReportKind[];
const STATE_TONE: Record<MigrationState, Tone> = { not_started: "slate", in_progress: "blue", checked_ok: "green", differences: "amber" };

async function post<T>(body: object | FormData): Promise<T> {
  const res = await fetch(API, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({
    error: res.status === 413 ? "The request is larger than the server accepts (4.5 MB)." : res.status === 504 ? "The server ran out of time (5 minutes). What was written is kept: start again, only what is missing is added." : res.statusText || `HTTP ${res.status}`,
  }))) as T & { error?: unknown };
  if (!res.ok) throw new Error(String(data.error ?? "Request failed"));
  return data;
}

/** "USD=16500, EUR=18000" ↔ { USD: 16500, EUR: 18000 }. */
function parseRates(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(/[,;\n]/)) {
    const m = part.trim().match(/^([A-Za-z]{3})\s*[=:]\s*([0-9.,]+)$/);
    if (m) { const v = Number(m[2].replace(/,/g, "")); if (v > 0) out[m[1].toUpperCase()] = v; }
  }
  return out;
}
const ratesText = (rates: Record<string, number>) => Object.entries(rates).map(([c, r]) => `${c}=${r}`).join(", ");

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
/** Net balance, debit positive: "1,250,000.00 Dr". */
const drcr = (n: number) => (n === 0 ? "0.00" : `${fmtNumber(Math.abs(n), 2)} ${n > 0 ? "Dr" : "Cr"}`);
const range = (from?: string, to?: string) => (from && to ? (from === to ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`) : to ? `as of ${fmtDate(to)}` : from ? `from ${fmtDate(from)}` : "");

interface Upload { name: string; size: number; state: "queued" | "sending" | "read" | "error"; message?: string }

export function MigrationWizard({ targets, statuses, initialTarget }: { targets: TargetOption[]; statuses: CompanyStatus[]; initialTarget?: string }) {
  const router = useRouter();
  const [target, setTarget] = useState(initialTarget ?? "");
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [result, setResult] = useState<(MigrationResult & { booksCreated: boolean; target: string }) | null>(null);
  const [checked, setChecked] = useState<{ entityId: string; entityName: string; check: TbCheck } | null>(null);
  const [busy, setBusy] = useState<"" | "state" | "upload" | "plan" | "run" | "check">("");
  const [error, setError] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>("auto");
  const [asOf, setAsOf] = useState("");
  const [fx, setFx] = useState("");
  const [customers, setCustomers] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const chosen = targets.find((t) => t.key === target);
  const files = draft?.files ?? [];
  const options = (): WizardOptions => ({ dateFormat, fxRates: parseRates(fx), asOf: asOf || undefined, customersToDirectory: customers });

  const guarded = async (what: typeof busy, fn: () => Promise<void>) => {
    setBusy(what); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const refreshPlan = async (key: string, opts: WizardOptions) => {
    const data = await post<{ draft: WizardDraft; plan: PlanView }>({ action: "plan", target: key, options: opts });
    setDraft(data.draft); setPlan(data.draft.files.length ? data.plan : null);
  };

  /** Step 1: pick the company; uploads left pending for it on the server come back. */
  const choose = (key: string) => guarded("state", async () => {
    setTarget(key); setDraft(null); setPlan(null); setResult(null); setUploads([]);
    if (!key) return;
    const data = await post<{ draft: WizardDraft }>({ action: "state", target: key });
    setDraft(data.draft);
    const o = data.draft.options;
    setDateFormat(o.dateFormat); setAsOf(o.asOf ?? ""); setFx(ratesText(o.fxRates)); setCustomers(Boolean(o.customersToDirectory));
    if (data.draft.files.length) await refreshPlan(key, o);
  });
  useEffect(() => { if (initialTarget) void choose(initialTarget); /* once, for ?target= */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Step 2: send the files in requests of at most 4 MB, one after the other, then plan. */
  const onFiles = (list: FileList | null) => guarded("upload", async () => {
    const picked = Array.from(list ?? []);
    if (!picked.length || !target) return;
    setResult(null);
    const lines: Upload[] = picked.map((f) => (f.size > QBO_MAX_FILE_BYTES ? { name: f.name, size: f.size, state: "error", message: `${f.name} ${QBO_TOO_LARGE}` } : { name: f.name, size: f.size, state: "queued" }));
    const show = (patch: (u: Upload, i: number) => Upload) => { lines.forEach((u, i) => { lines[i] = patch(u, i); }); setUploads([...lines]); };
    show((u) => u);
    const sendable = picked.map((f, i) => ({ f, i })).filter(({ f }) => f.size <= QBO_MAX_FILE_BYTES);
    for (const batch of uploadBatches(sendable.map(({ f }) => f.size))) {
      const part = batch.map((b) => sendable[b]);
      const index = new Set(part.map(({ i }) => i));
      show((u, i) => (index.has(i) ? { ...u, state: "sending" } : u));
      const fd = new FormData();
      fd.append("target", target);
      for (const { f } of part) fd.append("file", f);
      try {
        const data = await post<{ results: Array<{ name: string; file?: WizardFile; error?: string }>; draft: WizardDraft }>(fd);
        setDraft(data.draft);
        part.forEach(({ i }, n) => { const r = data.results[n]; lines[i] = r?.file ? { ...lines[i], state: "read", message: `${QBO_KIND_LABELS[r.file.kind]} · ${r.file.content}` } : { ...lines[i], state: "error", message: r?.error ?? "Not read" }; });
        setUploads([...lines]);
      } catch (e) {
        show((u, i) => (index.has(i) ? { ...u, state: "error", message: e instanceof Error ? e.message : String(e) } : u));
      }
    }
    if (input.current) input.current.value = "";
    await refreshPlan(target, options());
  });

  const changeKind = (fileId: string, kind: QboReportKind) => guarded("plan", async () => {
    await post({ action: "kind", target, fileId, kind });
    await refreshPlan(target, options());
  });
  const remove = (fileId: string) => guarded("plan", async () => {
    await post({ action: "remove", target, fileId });
    await refreshPlan(target, options());
  });
  const startOver = () => guarded("plan", async () => {
    if (!confirm("Remove every uploaded file of this company? Nothing imported earlier is touched.")) return;
    const data = await post<{ draft: WizardDraft }>({ action: "discard", target });
    setDraft(data.draft); setPlan(null); setUploads([]);
  });
  const updatePlan = () => guarded("plan", () => refreshPlan(target, options()));

  /** Step 4: import everything. The books of a company without books are created first. */
  const run = () => guarded("run", async () => {
    if (!plan || !chosen) return;
    const question = plan.totalWrites === 0
      ? `Compare the books of ${plan.entityName} with the QuickBooks trial balance? Nothing is posted.`
      : `${plan.createsBooks ? `Create the books of ${plan.entityName} and import` : `Import into ${plan.entityName}`} ${plan.totalWrites.toLocaleString("en-US")} records from ${files.length} file${files.length === 1 ? "" : "s"}? What already exists is skipped.`;
    if (!confirm(question)) return;
    const data = await post<MigrationResult & { booksCreated: boolean; target: string }>({ action: "run", target, options: options() });
    setResult(data); setChecked(null);
    if (!data.failed) { setPlan(null); setDraft(null); setUploads([]); }
    setTarget(data.target);
    router.refresh();
  });

  const checkAgain = (entityId: string) => guarded("check", async () => {
    setChecked(await post<{ entityId: string; entityName: string; check: TbCheck }>({ action: "check", entityId }));
    router.refresh();
  });

  const working = busy !== "";
  const targetOptions = result && !targets.some((t) => t.key === target) ? [...targets, { key: target, label: result.entityName, hasBooks: true, isOwn: false }] : targets;
  return (
    <div className="space-y-5">
      {error && <Notice tone="red">{error}</Notice>}

      <Card title="1 · Choose the company">
        <div className="grid gap-4 md:grid-cols-[minmax(0,26rem)_1fr]">
          <label className="block"><span className="label">Company to migrate</span>
            <select className="input" value={target} disabled={working} onChange={(e) => void choose(e.target.value)}>
              <option value="">— choose —</option>
              <optgroup label="Books">{targetOptions.filter((t) => t.hasBooks).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
              {targetOptions.some((t) => !t.hasBooks) && <optgroup label="Client companies without books yet">{targetOptions.filter((t) => !t.hasBooks).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>}
            </select>
          </label>
          <p className="text-xs text-ink-500 md:pt-5">
            One QuickBooks company file per company here. Every set of books is listed, then the active client companies that have no books yet: picking one of those <span className="font-medium">creates its books</span> (standard chart of accounts, default tax profile, linked to the client company) <span className="font-medium">when the migration starts</span>, not before.
            {chosen && !chosen.hasBooks && <span className="mt-1 block text-amber-900">{chosen.label} has no books yet: they will be created when you start the migration.</span>}
          </p>
        </div>
      </Card>

      <Card title="2 · Export from QuickBooks, then drop all the files at once" actions={files.length > 0 ? <button type="button" className="btn-ghost !px-2 !py-1 text-xs" disabled={working} onClick={startOver}>Start over</button> : undefined}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="text-xs text-ink-500">
            <p className="mb-1 font-medium text-ink-700">In QuickBooks Online, open each report and choose Export › Export to Excel:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li><span className="font-medium text-ink-700">Reports › Account List</span>: the chart of accounts.</li>
              <li><span className="font-medium text-ink-700">Reports › Journal</span>, Report period: All Dates (one file per year if it is large): the complete history, every transaction with its account lines.</li>
              <li><span className="font-medium text-ink-700">Reports › Trial Balance</span>, as of the last day you used QuickBooks: the figures the result is checked against.</li>
              <li><span className="font-medium text-ink-700">Reports › Invoice List</span> or <span className="font-medium text-ink-700">Open Invoices</span>: the invoices still to collect.</li>
              <li><span className="font-medium text-ink-700">Reports › Unpaid Bills</span>: the bills still to pay.</li>
              <li>Optional: Reports › Vendor Contact List (Supplier Contact List) and Customer Contact List.</li>
            </ul>
            <p className="mt-2">Not read: the General Ledger report (export the Journal instead), attachments, bank feeds and reconciliations, recurring templates, budgets, payroll and inventory quantities.</p>
          </div>
          <div>
            <label className="block"><span className="label">QuickBooks exports (.xlsx, .xls, .csv), several at once</span>
              <input ref={input} type="file" multiple accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" disabled={!target || working} onChange={(e) => void onFiles(e.target.files)} />
            </label>
            <p className="mt-1 text-xs text-ink-500">{target ? "The kind of each file is recognised from its report title and columns; nothing is written until you start the migration." : "Choose the company first."} Up to 4 MB and {QBO_MAX_ROWS.toLocaleString("en-US")} rows per file: the page sends the files in several requests. For a longer journal, export one year at a time (custom dates) and drop the years together.</p>
            {uploads.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {uploads.map((u, i) => (
                  <li key={i} className={u.state === "error" ? "text-red-700" : u.state === "read" ? "text-green-800" : "text-ink-500"}>
                    <span className="font-mono">{u.name}</span> ({size(u.size)}): {u.state === "queued" ? "waiting" : u.state === "sending" ? "sending and reading…" : u.state === "read" ? `read · ${u.message}` : u.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table table-wide">
              <thead><tr><th>File</th><th>Kind</th><th>Content</th><th>Dates covered</th><th>Company in the file</th><th /></tr></thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td><span className="font-mono text-xs">{f.name}</span><span className="block text-xs text-ink-500">{size(f.size)} · {f.rows.toLocaleString("en-US")} rows</span></td>
                    <td>
                      <select className="input !w-56 !py-1 text-xs" value={f.kind} disabled={working} onChange={(e) => void changeKind(f.id, e.target.value as QboReportKind)}>{KINDS.map((k) => <option key={k} value={k}>{QBO_KIND_LABELS[k]}</option>)}</select>
                      <span className="block text-xs text-ink-500">{f.kind === f.detected ? `detected from ${f.reason}` : `changed by hand (detected: ${QBO_KIND_LABELS[f.detected]})`}</span>
                    </td>
                    <td className="text-xs">{f.content}</td>
                    <td className="text-xs">{range(f.from, f.to) || f.period || "—"}</td>
                    <td className="text-xs">{f.company ?? "—"}{f.companyMismatch && <span className="block font-medium text-amber-900">Does not match {chosen?.label.replace(/^★ /, "") ?? "the chosen company"}: check that this export comes from the right QuickBooks company.</span>}</td>
                    <td className="text-right"><button type="button" className="text-xs text-red-700 underline" disabled={working} onClick={() => void remove(f.id)}>remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {files.length > 0 && (
          <details className="mt-3 rounded-lg border border-slate-200 p-3" open={Boolean(plan?.steps.some((s) => /no IDR rate/.test(s.errors.join(" "))) || plan?.warnings.some((w) => /trial balance date/.test(w)))}>
            <summary className="cursor-pointer text-sm font-medium">Options (date format, trial balance date, exchange rates)</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="block"><span className="label">Date format in the files</span>
                <select className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>{(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((v) => <option key={v} value={v}>{DATE_FORMAT_LABELS[v]}</option>)}</select>
              </label>
              <label className="block"><span className="label">Trial balance date</span>
                <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                <span className="mt-1 block text-xs text-ink-500">Only when the file does not print "As of …".</span>
              </label>
              <label className="block md:col-span-2"><span className="label">IDR per unit of foreign currency (invoices and bills)</span>
                <input className="input" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="USD=16500, EUR=18000" />
                <span className="mt-1 block text-xs text-ink-500">Used for documents whose file has no Exchange rate column. The journal is always read in the home currency.</span>
              </label>
              {chosen && !chosen.isOwn && files.some((f) => f.kind === "customers") && (
                <label className="flex items-start gap-2 text-sm md:col-span-4"><input type="checkbox" className="checkbox mt-0.5" checked={customers} onChange={(e) => setCustomers(e.target.checked)} /><span>Add this company's customers to the directory<span className="block text-xs text-ink-500">Off by default: the directory holds ILA's clients, and these are the customers of a client. Their names stay on the invoices and journal lines either way.</span></span></label>
              )}
            </div>
            <button type="button" className="btn-secondary mt-3" disabled={working} onClick={updatePlan}>Update the plan</button>
          </details>
        )}
      </Card>

      {(plan || busy === "plan" || busy === "upload") && files.length > 0 && (
        <Card title={<span>3 · The plan{plan ? <> for {plan.entityName}</> : null}</span>} className="border-brand-500/40 ring-1 ring-brand-500/20">
          {!plan ? <p className="text-sm text-ink-500">Reading the files and preparing the plan…</p> : (
            <>
              {plan.blocking && <div className="mb-3"><Notice tone="red">{plan.blocking}</Notice></div>}
              <ul className="mb-3 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
                {plan.createsBooks && <li>The books of {plan.entityName} do not exist yet: they are created first, with the standard chart of accounts.</li>}
                {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              {plan.warnings.length > 0 && <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-900">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
              <div className="overflow-x-auto">
                <table className="table table-wide">
                  <thead><tr><th className="w-8">#</th><th>Step</th><th>File</th><th>Will write</th><th className="num">Already there</th><th className="num">Skipped</th><th className="num">Errors</th></tr></thead>
                  <tbody>
                    {plan.steps.map((s, i) => (
                      <tr key={i}>
                        <td className="text-ink-500">{i + 1}</td>
                        <td className="font-medium">{s.title}</td>
                        <td>
                          <span className="font-mono text-xs">{s.fileName}</span>
                          {s.warnings.length > 0 && <details className="text-xs text-ink-500"><summary className="cursor-pointer">{s.warnings.length} note{s.warnings.length === 1 ? "" : "s"}</summary><ul className="mt-1 list-disc pl-4">{s.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul></details>}
                          {s.errorCount > 0 && <details className="text-xs" open={s.errorCount <= 5}><summary className="cursor-pointer text-red-700">{s.errorCount} row{s.errorCount === 1 ? "" : "s"} not imported</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4 text-ink-700">{s.errors.map((e, j) => <li key={j}>{e}</li>)}{s.errorCount > s.errors.length && <li>… and {s.errorCount - s.errors.length} more</li>}</ul></details>}
                          {s.blocking && <span className="block text-xs text-red-700">{s.blocking}</span>}
                        </td>
                        <td>{s.toWrite > 0 ? s.writes.join(", ") : <span className="text-ink-500">nothing new</span>}</td>
                        <td className="num">{s.duplicates.toLocaleString("en-US")}</td>
                        <td className="num">{s.skipped.toLocaleString("en-US")}</td>
                        <td className={`num ${s.errorCount ? "text-red-700" : ""}`}>{s.errorCount.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                    {plan.steps.length === 0 && <tr><td colSpan={7} className="text-sm text-ink-500">None of the files can be imported.</td></tr>}
                  </tbody>
                </table>
              </div>

              {plan.guessedAccounts.length > 0 && (
                <div className="mt-3">
                  <Notice tone="amber">
                    <span className="font-semibold">{plan.guessedAccounts.length} account{plan.guessedAccounts.length === 1 ? "" : "s"} created from the journal, check the type.</span> They are used in the Journal or the Trial Balance but missing from the Account List (often accounts deleted in QuickBooks), so their type is guessed from the name. Correct it afterwards in Books › Accounts.
                    <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-xs">{plan.guessedAccounts.map((g, i) => <li key={i}><span className="font-mono">{g.code}</span> {g.name} <span className="text-ink-500">({g.type}; QuickBooks: {g.qboName})</span></li>)}</ul>
                  </Notice>
                </div>
              )}
              {plan.notImported.length > 0 && (
                <div className="mt-3">
                  <Notice tone="blue"><span className="font-semibold">Not imported:</span><ul className="mt-1 list-disc pl-5 text-xs">{plan.notImported.map((n, i) => <li key={i}><span className="font-mono">{n.fileName}</span> ({QBO_KIND_LABELS[n.kind]}): {n.reason}</li>)}</ul></Notice>
                </div>
              )}
              {plan.check && <div className="mt-4"><CheckPanel check={plan.check} expected /></div>}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn-primary" disabled={working || Boolean(plan.blocking) || (plan.totalWrites === 0 && !plan.check)} onClick={run}>
                  {busy === "run" ? "Importing…" : plan.totalWrites > 0 ? `4 · Start the migration (${plan.totalWrites.toLocaleString("en-US")} records)` : plan.check ? "4 · Check the books against QuickBooks" : "Nothing new to import"}
                </button>
                {busy === "run" && <span className="text-xs text-ink-500">A long history takes a few minutes. Keep this tab open.</span>}
                {plan.totalWrites === 0 && !plan.blocking && plan.steps.length > 0 && <span className="text-xs text-ink-500">Everything in these files is already in the books.{plan.check ? " The comparison with the trial balance is recorded with the company's status." : ""}</span>}
              </div>
            </>
          )}
        </Card>
      )}

      {result && (
        <Card title={<span>5 · Result for {result.entityName}</span>}>
          <Notice tone={result.failed ? "red" : result.steps.some((s) => s.errorCount) ? "amber" : "green"}>
            {result.booksCreated && <>Books created for {result.entityName}. </>}
            {result.failed ? "The import stopped on an error. What was written is kept and the uploads are still pending: start the migration again, only what is missing is added." : result.steps.length === 0 ? "Nothing was posted: the trial balance was compared with the books." : `Imported ${result.steps.reduce((s, x) => s + x.inserted, 0).toLocaleString("en-US")} records from ${result.steps.length} file${result.steps.length === 1 ? "" : "s"}.`}
            <span className="ml-2 text-xs"><Link className="underline" href={`/books/${result.entityId}`}>Open books</Link> · <Link className="underline" href={`/books/${result.entityId}/journal`}>Journal</Link> · <Link className="underline" href={`/books/${result.entityId}/reports/trial-balance${result.check ? `?asOf=${result.check.asOf}` : ""}`}>Trial balance</Link></span>
          </Notice>
          <div className={result.steps.length ? "mt-3 overflow-x-auto" : "hidden"}>
            <table className="table table-wide">
              <thead><tr><th>Step</th><th>File</th><th className="num">Written</th><th className="num">Skipped</th><th className="num">Errors</th></tr></thead>
              <tbody>
                {result.steps.map((s, i) => (
                  <tr key={i}>
                    <td className="font-medium">{s.title}</td>
                    <td><span className="font-mono text-xs">{s.fileName}</span>
                      {s.failed && <span className="block text-xs text-red-700">Failed: {s.failed}</span>}
                      {s.errorCount > 0 && <details className="text-xs"><summary className="cursor-pointer text-red-700">{s.errorCount} error{s.errorCount === 1 ? "" : "s"}</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{s.errors.map((e, j) => <li key={j}>{e}</li>)}{s.errorCount > s.errors.length && <li>… and {s.errorCount - s.errors.length} more (see the import history)</li>}</ul></details>}
                    </td>
                    <td className="num text-green-800">{s.inserted.toLocaleString("en-US")}</td>
                    <td className="num">{s.skipped.toLocaleString("en-US")}</td>
                    <td className={`num ${s.errorCount ? "text-red-700" : ""}`}>{s.errorCount.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.takeOn && (result.takeOn.created > 0 || result.takeOn.problems.length > 0) && (
            <p className="mt-3 text-sm">
              {result.takeOn.created > 0 && <>{result.takeOn.created} fixed asset{result.takeOn.created === 1 ? "" : "s"} brought into the Assets register for review. <Link className="underline" href={`/books/${result.entityId}/assets?show=review`}>Review {result.takeOn.created === 1 ? "it" : "them"}</Link> </>}
              {result.takeOn.problems.length > 0 && <span className="text-amber-700">Fixed assets not brought in ({result.takeOn.problems.join("; ")}): see Books › Assets.</span>}
            </p>
          )}
          <div className="mt-4">{result.check ? <CheckPanel check={result.check} /> : !result.failed && <Notice tone="blue">No Trial Balance was given, so the result is not checked against QuickBooks yet. Upload Reports › Trial Balance (as of the last day you used QuickBooks) for this company at any time to run the check.</Notice>}</div>
        </Card>
      )}

      <Card title="Migration status per company">
        <div className="overflow-x-auto">
          <table className="table table-wide">
            <thead><tr><th>Company</th><th>Status</th><th>Imported so far</th><th>Files</th><th>Last check against QuickBooks</th><th /></tr></thead>
            <tbody>
              {statuses.map((s) => (
                <tr key={s.entityId}>
                  <td className="font-medium">{s.isOwn ? "★ " : ""}{s.name}</td>
                  <td><Badge tone={STATE_TONE[s.state]}>{MIGRATION_STATE_LABELS[s.state]}</Badge></td>
                  <td className="text-xs">{s.counts ? [
                    s.counts.journalEntries ? `${s.counts.journalEntries.toLocaleString("en-US")} journal entries` : "", s.counts.openingEntries ? "opening balances" : "",
                    s.counts.accountsCreated || s.counts.accountsMapped ? `${s.counts.accountsCreated} accounts created, ${s.counts.accountsMapped} mapped` : "",
                    s.counts.invoices ? `${s.counts.invoices} invoices` : "", s.counts.bills ? `${s.counts.bills} bills` : "", s.counts.vendors ? `${s.counts.vendors} vendors` : "", s.counts.customers ? `${s.counts.customers} customers` : "",
                  ].filter(Boolean).join(" · ") || "nothing yet" : "—"}</td>
                  <td className="text-xs">{s.files.length === 0 ? "—" : (
                    <details><summary className="cursor-pointer">{s.files.length} file{s.files.length === 1 ? "" : "s"}, last {fmtDateTime(s.updatedAt)}</summary>
                      <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{s.files.map((f, i) => <li key={i}><span className="font-mono">{f.name}</span>: {f.kind}, {f.rows.toLocaleString("en-US")} rows{range(f.from, f.to) ? `, ${range(f.from, f.to)}` : ""}; {fmtDateTime(f.at)}{f.byName ? ` by ${f.byName}` : ""}</li>)}</ul>
                    </details>
                  )}</td>
                  <td className="text-xs">{s.lastCheck ? <>{s.lastCheck.differences === 0 ? <span className="font-medium text-green-800">Matches QuickBooks</span> : <span className="font-medium text-amber-900">{s.lastCheck.differences} of {s.lastCheck.accounts} accounts differ</span>} as of {fmtDate(s.lastCheck.asOf)}<span className="block text-ink-500">checked {fmtDateTime(s.lastCheck.at)}</span></> : s.trialBalance ? "not run yet" : "—"}</td>
                  <td className="whitespace-nowrap text-right text-xs">
                    <Link className="underline" href={`/books/${s.entityId}`}>Open books</Link>
                    {s.trialBalance && <> · <button type="button" className="underline" disabled={working} onClick={() => void checkAgain(s.entityId)}>{busy === "check" ? "Checking…" : "Check again"}</button></>}
                    {" · "}<button type="button" className="underline" disabled={working} onClick={() => { void choose(`entity:${s.entityId}`); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{s.state === "not_started" ? "Migrate" : "Add files"}</button>
                  </td>
                </tr>
              ))}
              {statuses.length === 0 && <tr><td colSpan={6} className="text-sm text-ink-500">No books yet. Choose a client company above: its books are created when the migration starts.</td></tr>}
            </tbody>
          </table>
        </div>
        {checked && <div className="mt-4"><p className="mb-2 text-sm font-semibold text-ink-700">{checked.entityName}</p><CheckPanel check={checked.check} /></div>}
      </Card>
    </div>
  );
}

/** The proof: Account · QuickBooks · App · Difference, green when every difference is zero. `expected`: computed on the dry run, before anything is written. */
function CheckPanel({ check, expected = false }: { check: TbCheck; expected?: boolean }) {
  const [all, setAll] = useState(false);
  const differing = check.rows.filter((r) => r.difference !== 0);
  const rows = all ? check.rows : differing;
  return (
    <div>
      <Notice tone={check.matches ? "green" : "amber"}>
        {check.matches
          ? <><span className="font-semibold">{expected ? "After the import the books will match QuickBooks" : "Matches QuickBooks"}</span>: {check.accounts} accounts compared as of {fmtDate(check.asOf)}, every difference is zero.</>
          : <><span className="font-semibold">{expected ? `After the import ${check.differences} of ${check.accounts} accounts will differ from QuickBooks` : `${check.differences} of ${check.accounts} accounts differ from QuickBooks`}</span> as of {fmtDate(check.asOf)}.{expected && " Usual causes: a journal file that does not cover every year up to that date, transactions rejected below (see the errors of the journal step), or a trial balance exported on another basis (cash instead of accrual)."}</>}
        <span className="mt-1 block text-xs">
          QuickBooks: debits {fmtNumber(check.qboDebit, 2)}, credits {fmtNumber(check.qboCredit, 2)} · App: debits {fmtNumber(check.appDebit, 2)}, credits {fmtNumber(check.appCredit, 2)}.{" "}
          {check.plFrom ? `Income and expense accounts are compared from ${fmtDate(check.plFrom)}: QuickBooks shows them for the financial year and carries the earlier result in Retained Earnings, and the app's figures are laid out the same way.` : "Every account is compared on its balance since the first entry."}
        </span>
      </Notice>
      {(rows.length > 0 || check.rows.length > 0) && (
        <div className="mt-2 overflow-x-auto">
          <table className="table table-wide">
            <thead><tr><th>Account</th><th className="num">QuickBooks</th><th className="num">App</th><th className="num" title="App minus QuickBooks; a positive figure is more debit in the app">Difference</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.code && <span className="mr-2 font-mono text-xs">{r.code}</span>}{r.name}{!r.accountId && r.qboNames.length > 0 && <span className="ml-2 text-xs text-amber-900">not in the chart</span>}{r.accountId && r.qboNames.length > 0 && r.qboNames.join(", ") !== r.name && <span className="block text-xs text-ink-500">QuickBooks: {r.qboNames.join(", ")}</span>}</td>
                  <td className="num">{drcr(r.qbo)}</td>
                  <td className="num">{drcr(r.app)}</td>
                  <td className={`num ${r.difference ? "font-semibold text-red-700" : "text-green-800"}`}>{r.difference ? fmtNumber(r.difference, 2) : "0.00"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="text-sm text-ink-500">No differing account.</td></tr>}
            </tbody>
          </table>
          {check.rows.length > differing.length && <button type="button" className="mt-2 text-xs text-brand-700 underline" onClick={() => setAll(!all)}>{all ? "Show differing accounts only" : `Show all ${check.rows.length} accounts`}</button>}
        </div>
      )}
    </div>
  );
}
