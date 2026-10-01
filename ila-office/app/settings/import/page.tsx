import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { DATE_FORMAT_LABELS } from "@/lib/importers";
import { FX_CURRENCIES, IMPORT_KINDS, IMPORT_KIND_LABELS, listImportBatches, loadImportDraft, prepareImport, type ImportKind, type ImportOptions, type ImportPlan } from "@/lib/import-services";
import { Page, Card, Badge, Field, Select, Notice, EmptyState } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { discardPendingImport, previewImport, runPendingImport, updateImportOptions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import data" };

const DATE_OPTIONS = (Object.keys(DATE_FORMAT_LABELS) as Array<keyof typeof DATE_FORMAT_LABELS>).map((v) => ({ value: v, label: DATE_FORMAT_LABELS[v] }));

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ preview?: string; done?: string; error?: string }> }) {
  const user = await requirePermission("admin");
  const sp = await searchParams;
  const previewKind = IMPORT_KINDS.find((k) => k === sp.preview);
  const [batches, draft, ownEntities, users] = await Promise.all([
    listImportBatches(40), previewKind ? loadImportDraft(user.id, previewKind) : Promise.resolve(null), db.list("entities", { where: { isOwn: true } }), db.list("users"),
  ]);
  const own = ownEntities[0];
  const plan = draft ? await prepareImport(draft.kind, draft.text, draft.options) : null;
  const done = sp.done ? batches.find((b) => b.id === sp.done) : undefined;
  const userName = (id?: string) => users.find((u) => u.id === id)?.name ?? "—";

  return (
    <Page title="Import data" subtitle="Bring HubSpot and QuickBooks Online across as CSV files. Every file is previewed first; rows that already exist are skipped, so re-running a file is safe." breadcrumbs={[{ href: "/settings/entities", label: "Settings" }, { label: "Import" }]}>
      {sp.error && <div className="mb-4"><Notice tone="red">{sp.error}</Notice></div>}
      {done && (
        <div className="mb-4">
          <Notice tone={done.errors.length ? "amber" : "green"}>
            <span className="font-semibold">{IMPORT_KIND_LABELS[done.kind as ImportKind] ?? done.kind}</span>: {done.inserted} inserted, {done.skipped} skipped out of {done.rows} rows in <span className="font-mono">{done.fileName}</span>.
            {done.errors.length > 0 && <details className="mt-1"><summary className="cursor-pointer">{done.errors.length} error{done.errors.length === 1 ? "" : "s"}</summary><ul className="mt-1 list-disc pl-5 text-xs">{done.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
            <span className="ml-2 text-xs">
              {done.kind === "qbo_invoices" && done.entityId ? <Link className="underline" href={`/books/${done.entityId}/invoices`}>Open invoices</Link> : <Link className="underline" href="/crm/contacts">Open contacts</Link>}
            </span>
          </Notice>
        </div>
      )}

      {draft && plan && <PreviewPanel plan={plan} fileName={draft.fileName} options={draft.options} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1 · HubSpot contacts">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="hubspot_contacts" />
            <p className="text-xs text-ink-500">HubSpot → Contacts → Export. Columns used: Record ID, First Name, Last Name, Email, Phone Number, Lead Status, Create Date, Associated Company, Contact owner, Country/Region. Lead status and lifecycle stage become tags; the associated company is created when it does not exist.</p>
            <Field label="CSV file"><input type="file" name="file" accept=".csv,text/csv" required className="input" /></Field>
            <Field label="Date format in the file"><Select name="dateFormat" defaultValue="auto" options={DATE_OPTIONS} /></Field>
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="2 · QuickBooks customers">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_customers" />
            <p className="text-xs text-ink-500">QuickBooks → Sales → Customers → Export to Excel (save as CSV), or Reports → Customer Contact List. Names with a company token (PT, CV, Ltd, Pty, GmbH, Inc…) become companies, the rest contacts; "Last, First" is split; currency suffixes (" - USD") are stripped and kept as a tag. Import this before invoices so they link to the right customer.</p>
            <Field label="CSV file"><input type="file" name="file" accept=".csv,text/csv" required className="input" /></Field>
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="3 · QuickBooks invoices">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_invoices" />
            <p className="text-xs text-ink-500">QuickBooks → Reports → Invoice List (or Sales → Invoices → Export). Columns used: Date, Num, Customer, Memo/Description, Amount, Open Balance, Due date, Currency, Exchange rate. Invoices land in {own ? <span className="font-medium">{own.name}</span> : <span className="text-red-700">ILA's own entity (none yet: create it in Entities)</span>}; status is paid / partial / sent from the open balance.</p>
            <Field label="CSV file"><input type="file" name="file" accept=".csv,text/csv" required className="input" /></Field>
            <InvoiceOptions />
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
      </div>

      <Card title="Import history" className="mt-5 overflow-x-auto">
        {batches.length === 0 ? <EmptyState title="No import yet" hint="Each run is recorded here with its counts and errors." /> : (
          <table className="table">
            <thead><tr><th>When</th><th>Kind</th><th>File</th><th className="num">Rows</th><th className="num">Inserted</th><th className="num">Skipped</th><th>Errors</th><th>By</th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(b.createdAt)}</td>
                  <td><Badge tone={b.kind === "qbo_invoices" ? "indigo" : b.kind === "qbo_customers" ? "blue" : "brand"}>{IMPORT_KIND_LABELS[b.kind as ImportKind] ?? b.kind}</Badge></td>
                  <td className="max-w-[16rem] truncate font-mono text-xs" title={b.fileName}>{b.fileName}</td>
                  <td className="num">{b.rows}</td>
                  <td className="num text-green-800">{b.inserted}</td>
                  <td className="num">{b.skipped}</td>
                  <td className="text-xs">{b.errors.length === 0 ? <span className="text-ink-500">none</span> : <details><summary className="cursor-pointer text-red-700">{b.errors.length}</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{b.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}</td>
                  <td className="text-xs">{userName(b.byUserId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}

function InvoiceOptions({ options }: { options?: ImportOptions }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date format"><Select name="dateFormat" defaultValue={options?.dateFormat ?? "auto"} options={DATE_OPTIONS} /></Field>
        <Field label="Only invoices from" hint="Cut-over date; leave empty for all."><input type="date" name="fromDate" defaultValue={options?.fromDate} className="input" /></Field>
      </div>
      <div>
        <span className="label">IDR per unit of foreign currency</span>
        <div className="grid grid-cols-3 gap-2">
          {FX_CURRENCIES.map((c) => <label key={c} className="flex items-center gap-1 text-xs"><span className="w-8 font-medium">{c}</span><input name={`fx_${c}`} type="number" step="any" min={0} defaultValue={options?.fxRates[c] ?? ""} placeholder="rate" className="input !py-1" /></label>)}
        </div>
        <input name="fx_other" defaultValue={Object.entries(options?.fxRates ?? {}).filter(([c]) => !(FX_CURRENCIES as readonly string[]).includes(c)).map(([c, r]) => `${c}=${r}`).join(", ")} placeholder="Other: CHF=18500, JPY=110" className="input mt-2 !py-1 text-xs" />
        <p className="mt-1 text-xs text-ink-500">Used when the file has no Exchange rate column. One rate per currency for the whole file; refine per invoice later in Books.</p>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="postToLedger" defaultChecked={options?.postToLedger} className="checkbox mt-0.5" /><span>Post to the ledger<span className="block text-xs text-ink-500">One journal per invoice: Dr Accounts receivable / Cr Service revenue, in IDR. Already-imported invoice numbers are never posted twice. Receipts are not posted; match them from the bank import.</span></span></label>
    </>
  );
}

function PreviewPanel({ plan, fileName, options }: { plan: ImportPlan; fileName: string; options: ImportOptions }) {
  const kind = plan.kind;
  const canImport = !plan.blocking && plan.toInsert + plan.companyPatches.length + plan.contactPatches.length > 0;
  return (
    <Card className="mb-5 border-brand-500/40 ring-1 ring-brand-500/20" title={<span>Preview · {IMPORT_KIND_LABELS[kind]} · <span className="font-mono">{fileName}</span></span>} actions={
      <form action={discardPendingImport}><input type="hidden" name="kind" value={kind} /><button className="btn-ghost !px-2 !py-1 text-xs">Discard</button></form>
    }>
      {plan.blocking && <div className="mb-3"><Notice tone="red">{plan.blocking}</Notice></div>}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Badge tone="slate">{plan.rows} rows read</Badge>
        <Badge tone="green">{plan.toInsert} to insert</Badge>
        {(plan.companyPatches.length + plan.contactPatches.length) > 0 && <Badge tone="blue">{plan.companyPatches.length + plan.contactPatches.length} to link</Badge>}
        <Badge tone="amber">{plan.duplicates.length} duplicates</Badge>
        <Badge tone="slate">{plan.skipped.length} skipped</Badge>
        <Badge tone={plan.errors.length ? "red" : "slate"}>{plan.errors.length} errors</Badge>
        {plan.currencies.length > 0 && <Badge tone="indigo">currencies: {plan.currencies.join(", ")}</Badge>}
        {kind === "qbo_invoices" && <Badge tone={options.postToLedger ? "green" : "slate"}>{options.postToLedger ? "will post to ledger" : "no ledger posting"}</Badge>}
      </div>
      {plan.headers.length > 0 && <p className="mb-2 text-xs text-ink-500">Columns found: {plan.headers.filter(Boolean).join(" · ")}</p>}
      {plan.warnings.length > 0 && <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-900">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {plan.missingRates.length > 0 && <div className="mb-3"><Notice tone="amber">No IDR rate for {plan.missingRates.join(", ")}: those invoices are rejected until you set a rate below.</Notice></div>}

      {kind === "qbo_invoices" && (
        <details className="mb-3 rounded-lg border border-slate-200 p-3" open={plan.missingRates.length > 0}>
          <summary className="cursor-pointer text-sm font-medium">Options (date format, rates, posting)</summary>
          <form action={updateImportOptions} className="mt-3 space-y-3">
            <input type="hidden" name="kind" value={kind} />
            <InvoiceOptions options={options} />
            <SubmitButton className="btn-secondary" pendingText="Updating…">Update preview</SubmitButton>
          </form>
        </details>
      )}
      {kind === "hubspot_contacts" && (
        <details className="mb-3 rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Options (date format)</summary>
          <form action={updateImportOptions} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="kind" value={kind} />
            <Field label="Date format in the file"><Select name="dateFormat" defaultValue={options.dateFormat} options={DATE_OPTIONS} className="input !w-56" /></Field>
            <SubmitButton className="btn-secondary" pendingText="Updating…">Update preview</SubmitButton>
          </form>
        </details>
      )}

      {plan.sample.length > 0 ? (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs text-ink-500">First {plan.sample.length} of {plan.toInsert} rows as they will be stored:</p>
          <table className="table">
            <thead><tr><th>Line</th>{plan.columns.map((c) => <th key={c}>{c}</th>)}<th>Notes</th></tr></thead>
            <tbody>
              {plan.sample.map((r) => (
                <tr key={r.line}>
                  <td className="text-xs text-ink-500">{r.line}</td>
                  {r.cells.map((c, i) => <td key={i} className="max-w-[18rem] truncate text-xs" title={c}>{c}</td>)}
                  <td className="text-xs text-amber-900">{r.warnings.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !plan.blocking && <p className="text-sm text-ink-500">Nothing new to insert{plan.rows === 0 ? ": no data rows were found. Check that the file is a CSV with a header line." : "."}</p>}

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {plan.duplicates.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">{plan.duplicates.length} duplicates (skipped)</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{plan.duplicates.slice(0, 200).map((d, i) => <li key={i}>line {d.line}: {d.label} — {d.reason}</li>)}</ul></details>}
        {plan.skipped.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">{plan.skipped.length} skipped</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{plan.skipped.slice(0, 200).map((d, i) => <li key={i}>line {d.line}: {d.reason}</li>)}</ul></details>}
        {plan.errors.length > 0 && <details className="text-xs" open><summary className="cursor-pointer font-medium text-red-700">{plan.errors.length} errors (rows not imported)</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{plan.errors.slice(0, 200).map((d, i) => <li key={i}>line {d.line}: {d.message}</li>)}</ul></details>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canImport ? (
          <ConfirmForm action={runPendingImport} message={`Import ${plan.toInsert} rows${plan.posting ? ` and post ${plan.posting.invoices.length} journal entries` : ""}? Duplicates are skipped.`}>
            <input type="hidden" name="kind" value={kind} />
            <SubmitButton pendingText="Importing…">Import {plan.toInsert} rows{plan.posting ? ` + post ${plan.posting.invoices.length} journals` : ""}</SubmitButton>
          </ConfirmForm>
        ) : <button className="btn-primary" disabled>Nothing to import</button>}
        <form action={discardPendingImport}><input type="hidden" name="kind" value={kind} /><button className="btn-secondary">Discard upload</button></form>
      </div>
    </Card>
  );
}
