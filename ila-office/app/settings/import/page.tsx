import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { DATE_FORMAT_LABELS } from "@/lib/importers";
import { FX_CURRENCIES, IMPORT_KINDS, IMPORT_KIND_LABELS, isBooksImport, listImportBatches, loadImportDraft, planCount, prepareImport, type ImportKind, type ImportOptions, type ImportPlan } from "@/lib/import-services";
import type { Entity } from "@/lib/types";
import { Page, Card, CardTable, Cols, Dash, Badge, Field, Select, Notice, EmptyState } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { discardPendingImport, previewImport, runPendingImport, updateImportOptions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import data" };

const DATE_OPTIONS = (Object.keys(DATE_FORMAT_LABELS) as Array<keyof typeof DATE_FORMAT_LABELS>).map((v) => ({ value: v, label: DATE_FORMAT_LABELS[v] }));
const KIND_TONE: Record<ImportKind, "brand" | "blue" | "indigo" | "green" | "amber" | "slate"> = { hubspot_contacts: "brand", qbo_customers: "blue", qbo_invoices: "indigo", qbo_accounts: "slate", qbo_trial_balance: "green", qbo_journal: "green", qbo_bills: "amber" };
/** Where the imported records can be seen afterwards. */
function doneLink(kind: ImportKind, entityId?: string): { href: string; label: string } {
  if (!entityId || !isBooksImport(kind)) return { href: "/clients/contacts", label: "Open contacts" };
  const base = `/books/${entityId}`;
  if (kind === "qbo_invoices") return { href: `${base}/sales`, label: "Open invoices" };
  if (kind === "qbo_bills") return { href: `${base}/purchases`, label: "Open bills" };
  if (kind === "qbo_accounts") return { href: `${base}/accounts`, label: "Open chart of accounts" };
  return { href: `${base}/journal`, label: "Open journal" };
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ preview?: string; done?: string; error?: string }> }) {
  const user = await requirePermission("admin");
  const sp = await searchParams;
  const previewKind = IMPORT_KINDS.find((k) => k === sp.preview);
  const [batches, draft, entities, users] = await Promise.all([
    listImportBatches(40), previewKind ? loadImportDraft(user.id, previewKind) : Promise.resolve(null), db.list("entities", { orderBy: "name" }), db.list("users"),
  ]);
  const own = entities.find((e) => e.isOwn);
  const books = entities.filter((e) => e.status !== "closed");
  const plan = draft ? await prepareImport(draft.kind, draft.text, draft.options) : null;
  const done = sp.done ? batches.find((b) => b.id === sp.done) : undefined;
  const userName = (id?: string) => users.find((u) => u.id === id)?.name;
  const entityName = (id?: string) => entities.find((e) => e.id === id)?.name;
  const file = <Field label="CSV file"><input type="file" name="file" accept=".csv,text/csv" required className="input" /></Field>;

  return (
    <Page title="Import data" subtitle="Bring HubSpot and QuickBooks Online across as CSV files. Every file is previewed first; rows that already exist are skipped, so re-running a file is safe." breadcrumbs={[{ href: "/settings/entities", label: "Settings" }, { label: "Import" }]}>
      {sp.error && <div className="mb-4"><Notice tone="red">{sp.error}</Notice></div>}
      {done && (
        <div className="mb-4">
          <Notice tone={done.errors.length ? "amber" : "green"}>
            <span className="font-semibold">{IMPORT_KIND_LABELS[done.kind as ImportKind] ?? done.kind}</span>{done.entityId && entityName(done.entityId) ? <> into <span className="font-semibold">{entityName(done.entityId)}</span></> : null}: {done.inserted} inserted, {done.skipped} skipped out of {done.rows} rows in <span className="font-mono">{done.fileName}</span>.
            {done.errors.length > 0 && <details className="mt-1"><summary className="cursor-pointer">{done.errors.length} error{done.errors.length === 1 ? "" : "s"}</summary><ul className="mt-1 list-disc pl-5 text-xs">{done.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
            <span className="ml-2 text-xs"><Link className="underline" href={doneLink(done.kind as ImportKind, done.entityId).href}>{doneLink(done.kind as ImportKind, done.entityId).label}</Link></span>
          </Notice>
        </div>
      )}

      {draft && plan && <PreviewPanel plan={plan} fileName={draft.fileName} options={draft.options} entities={books} own={own} />}

      <h2 className="mb-2 text-sm font-semibold text-ink-700">Directory (CRM)</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1 · HubSpot contacts">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="hubspot_contacts" />
            <p className="text-xs text-ink-500">HubSpot → Contacts → Export. Columns used: Record ID, First Name, Last Name, Email, Phone Number, Lead Status, Create Date, Associated Company, Contact owner, Country/Region. Lead status and lifecycle stage become tags; the associated company is created when it does not exist.</p>
            {file}
            <Field label="Date format in the file"><Select name="dateFormat" defaultValue="auto" options={DATE_OPTIONS} /></Field>
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="2 · QuickBooks customers">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_customers" />
            <p className="text-xs text-ink-500">QuickBooks → Sales → Customers → Export to Excel (save as CSV), or Reports → Customer Contact List. Names with a company token (PT, CV, Ltd, Pty, GmbH, Inc…) become companies, the rest contacts; "Last, First" is split; currency suffixes (" - USD") are stripped and kept as a tag. Import this before invoices so they link to the right customer.</p>
            {file}
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="Then: books per company">
          <p className="text-xs text-ink-500">Client companies imported from QuickBooks appear in the directory only. Each one whose accounting ILA keeps needs its own set of books: open the company and use <span className="font-medium">create books</span>, or <Link className="underline" href="/clients/companies">create books for every active client at once</Link>. Then, per company and in this order, import from its QuickBooks file: <span className="font-medium">(1)</span> the account list, <span className="font-medium">(2)</span> the trial balance at the cut-over date — or the journal for the full history, <span className="font-medium">(3)</span> open invoices, <span className="font-medium">(4)</span> open bills. Bank statements are then imported and reconciled from the Bank tab of the books.</p>
          {books.length === 0 ? <p className="mt-2 text-xs text-red-700">No entity yet: create ILA's own entity in Settings → Entities first.</p> : <p className="mt-2 text-xs text-ink-500">{books.length} set{books.length === 1 ? "" : "s"} of books available in the selectors below.</p>}
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Books (per QuickBooks file: pick the entity on each card)</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="3 · QuickBooks invoices">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_invoices" />
            <p className="text-xs text-ink-500">QuickBooks → Reports → Invoice List (or Sales → Invoices → Export to Excel, save as CSV). Columns used: Date, Num, Customer, Memo/Description, Amount, Open Balance, Due date, Currency, Exchange rate. Status is paid / partial / sent from the open balance; the customer is matched to the directory by QBO name.</p>
            {file}
            <BooksOptions kind="qbo_invoices" entities={books} own={own} />
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="4 · QuickBooks account list">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_accounts" />
            <p className="text-xs text-ink-500">QuickBooks → Reports → Account List → Export → Export to Excel (save as CSV). Columns used: Account, Type, Detail type, Account number (when numbers are on), Balance. QBO types are mapped to our chart (Bank → asset/bank, Accounts receivable → AR, Other current liabilities → other liability or tax payable, Income → sales…); existing accounts are matched by number then by name and remembered under their QBO name; the rest are created with the next free code. Run this first: the trial balance and the journal need every account mapped.</p>
            {file}
            <BooksOptions kind="qbo_accounts" entities={books} own={own} />
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="5 · QuickBooks trial balance (opening balances)">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_trial_balance" />
            <p className="text-xs text-ink-500">QuickBooks → Reports → Trial Balance, report period ending on the cut-over date → Export → Export to Excel (save as CSV). Columns used: Account (first column, often unnamed), Debit, Credit. One opening journal dated at the cut-over with one line per account; P&L balances are carried as they are, so a mid-year cut-over keeps the year-to-date result. Use this instead of the journal when QuickBooks history stays in QuickBooks.</p>
            {file}
            <BooksOptions kind="qbo_trial_balance" entities={books} own={own} />
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="6 · QuickBooks journal (full history)">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_journal" />
            <p className="text-xs text-ink-500">QuickBooks → Reports → Journal, date range to import → Export → Export to Excel (save as CSV). Columns used: Date, Transaction Type, Num, Name, Memo/Description, Account, Debit, Credit. Each transaction becomes one manual journal entry (memo "QBO type num name"); entries already imported are skipped. Do not combine with the trial balance for the same period, or balances double.</p>
            {file}
            <BooksOptions kind="qbo_journal" entities={books} own={own} />
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
        <Card title="7 · QuickBooks bills">
          <form action={previewImport} className="space-y-3">
            <input type="hidden" name="kind" value="qbo_bills" />
            <p className="text-xs text-ink-500">QuickBooks → Expenses → Bills (filter, then Export to Excel, save as CSV), or Reports → Unpaid Bills / Bill List. Columns used: Date, Num (bill no.), Vendor/Supplier, Due date, Amount, Open balance, Memo, Currency, Exchange rate. One bill per number with one line to Other operating expenses (6-9000); the vendor is matched to the directory by name; status is paid / partial / sent from the open balance.</p>
            {file}
            <BooksOptions kind="qbo_bills" entities={books} own={own} />
            <SubmitButton pendingText="Reading…">Preview</SubmitButton>
          </form>
        </Card>
      </div>

      <Card title="Import history" className="mt-5">
        {batches.length === 0 ? <EmptyState title="No import yet" hint="Each run is recorded here with its counts and errors." /> : (
          <CardTable>
            <table className="table table-data min-w-[1180px]">
              <Cols widths={[160, 190, 150, undefined, 95, 95, 95, 95, 150]} />
              <thead><tr><th>When</th><th>Kind</th><th>Entity</th><th>File</th><th className="num">Rows</th><th className="num">Inserted</th><th className="num">Skipped</th><th className="num">Errors</th><th>By</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(b.createdAt)}</td>
                    <td><Badge tone={KIND_TONE[b.kind as ImportKind] ?? "slate"}>{IMPORT_KIND_LABELS[b.kind as ImportKind] ?? b.kind}</Badge></td>
                    <td>{entityName(b.entityId) ? <span className="cell" title={entityName(b.entityId)}>{entityName(b.entityId)}</span> : <Dash />}</td>
                    <td>
                      <span className="cell font-mono text-xs" title={b.fileName}>{b.fileName}</span>
                      {b.errors.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-red-700">{b.errors.length} error{b.errors.length === 1 ? "" : "s"}</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4 text-ink-700">{b.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
                    </td>
                    <td className="num">{b.rows}</td>
                    <td className="num text-green-800">{b.inserted}</td>
                    <td className="num">{b.skipped}</td>
                    <td className={`num ${b.errors.length ? "text-red-700" : ""}`}>{b.errors.length}</td>
                    <td>{userName(b.byUserId) ? <span className="cell" title={userName(b.byUserId)}>{userName(b.byUserId)}</span> : <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        )}
      </Card>
    </Page>
  );
}

/** Entity selector shared by every books import; ILA's own entity is preselected. */
function EntitySelect({ entities, own, value }: { entities: Entity[]; own?: Entity; value?: string }) {
  const options = entities.map((e) => ({ value: e.id, label: `${e.isOwn ? "★ " : ""}${e.name}` }));
  return <Field label="Import into (entity)" hint="The set of books this QuickBooks file belongs to."><Select name="entityId" defaultValue={value ?? own?.id ?? ""} options={options.length ? options : [{ value: "", label: "— no entity yet —" }]} /></Field>;
}

/** Options of a books import card (and of its preview): entity, dates, FX rates and posting as the kind needs. */
function BooksOptions({ kind, options, entities, own }: { kind: ImportKind; options?: ImportOptions; entities: Entity[]; own?: Entity }) {
  const docs = kind === "qbo_invoices" || kind === "qbo_bills";
  const dateFormat = <Field label="Date format"><Select name="dateFormat" defaultValue={options?.dateFormat ?? "auto"} options={DATE_OPTIONS} /></Field>;
  const fromLabel = kind === "qbo_trial_balance" ? "Trial balance as of (cut-over date)" : kind === "qbo_journal" ? "Import entries from" : kind === "qbo_bills" ? "Only bills from" : "Only invoices from";
  const fromHint = kind === "qbo_trial_balance" ? "Date of the opening journal; read from the report title when empty." : "Cut-over date; leave empty for all.";
  return (
    <>
      <EntitySelect entities={entities} own={own} value={options?.entityId} />
      {kind !== "qbo_accounts" && (
        <div className="grid grid-cols-2 gap-3">
          {kind !== "qbo_trial_balance" && dateFormat}
          <Field label={fromLabel} hint={fromHint}><input type="date" name="fromDate" defaultValue={options?.fromDate} className="input" /></Field>
        </div>
      )}
      {docs && (
        <>
          <div>
            <span className="label">IDR per unit of foreign currency</span>
            <div className="grid grid-cols-3 gap-2">
              {FX_CURRENCIES.map((c) => <label key={c} className="flex items-center gap-1 text-xs"><span className="w-8 font-medium">{c}</span><input name={`fx_${c}`} type="number" step="any" min={0} defaultValue={options?.fxRates[c] ?? ""} placeholder="rate" className="input !py-1" /></label>)}
            </div>
            <input name="fx_other" defaultValue={Object.entries(options?.fxRates ?? {}).filter(([c]) => !(FX_CURRENCIES as readonly string[]).includes(c)).map(([c, r]) => `${c}=${r}`).join(", ")} placeholder="Other: CHF=18500, JPY=110" className="input mt-2 !py-1 text-xs" />
            <p className="mt-1 text-xs text-ink-500">Used when the file has no Exchange rate column. One rate per currency for the whole file; refine per document later in Books.</p>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="postToLedger" defaultChecked={options?.postToLedger} className="checkbox mt-0.5" /><span>Post to the ledger<span className="block text-xs text-ink-500">{kind === "qbo_bills" ? "One journal per bill: Dr Other operating expenses / Cr Accounts payable, in IDR. Already-imported bill numbers are never posted twice. Payments are not posted; match them from the bank import." : "One journal per invoice: Dr Accounts receivable / Cr Service revenue, in IDR. Already-imported invoice numbers are never posted twice. Receipts are not posted; match them from the bank import."}</span></span></label>
        </>
      )}
    </>
  );
}

/** Text of the Import button: what the plan writes or posts. */
function importLabel(plan: ImportPlan): string {
  const n = plan.toInsert;
  if (plan.kind === "qbo_accounts") return n === 0 ? `Tag ${plan.accountPatches.length} existing account${plan.accountPatches.length === 1 ? "" : "s"}` : `Create ${n} account${n === 1 ? "" : "s"}${plan.accountPatches.length ? ` + tag ${plan.accountPatches.length} existing` : ""}`;
  if (plan.kind === "qbo_trial_balance") return `Post opening journal (${plan.journals[0]?.lines.length ?? 0} lines)`;
  if (plan.kind === "qbo_journal") return `Post ${n} journal entr${n === 1 ? "y" : "ies"}`;
  if (plan.kind === "qbo_bills") return `Import ${n} bill${n === 1 ? "" : "s"}${plan.billPosting ? ` + post ${plan.billPosting.bills.length} journals` : ""}`;
  return `Import ${n} rows${plan.posting ? ` + post ${plan.posting.invoices.length} journals` : ""}`;
}

function PreviewPanel({ plan, fileName, options, entities, own }: { plan: ImportPlan; fileName: string; options: ImportOptions; entities: Entity[]; own?: Entity }) {
  const kind = plan.kind;
  const canImport = !plan.blocking && planCount(plan) > 0;
  const posting = plan.posting ? plan.posting.invoices.length : plan.billPosting ? plan.billPosting.bills.length : 0;
  const linking = plan.companyPatches.length + plan.contactPatches.length + plan.accountPatches.length;
  return (
    <Card className="mb-5 border-brand-500/40 ring-1 ring-brand-500/20" title={<span>Preview · {IMPORT_KIND_LABELS[kind]}{plan.entityName ? <> → {plan.entityName}</> : null} · <span className="font-mono">{fileName}</span></span>} actions={
      <form action={discardPendingImport}><input type="hidden" name="kind" value={kind} /><button className="btn-ghost !px-2 !py-1 text-xs">Discard</button></form>
    }>
      {plan.blocking && <div className="mb-3"><Notice tone="red">{plan.blocking}</Notice></div>}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Badge tone="slate">{plan.rows} rows read</Badge>
        <Badge tone="green">{plan.toInsert} to {kind === "qbo_trial_balance" || kind === "qbo_journal" ? "post" : "insert"}</Badge>
        {linking > 0 && <Badge tone="blue">{linking} to link</Badge>}
        <Badge tone="amber">{plan.duplicates.length} duplicates</Badge>
        <Badge tone="slate">{plan.skipped.length} skipped</Badge>
        <Badge tone={plan.errors.length ? "red" : "slate"}>{plan.errors.length} errors</Badge>
        {plan.currencies.length > 0 && <Badge tone="indigo">currencies: {plan.currencies.join(", ")}</Badge>}
        {(kind === "qbo_invoices" || kind === "qbo_bills") && <Badge tone={options.postToLedger ? "green" : "slate"}>{options.postToLedger ? `will post ${posting} journals` : "no ledger posting"}</Badge>}
      </div>
      {plan.headers.length > 0 && <p className="mb-2 text-xs text-ink-500">Columns found: {plan.headers.map((h, i) => h || `(column ${i + 1})`).join(" · ")}</p>}
      {plan.warnings.length > 0 && <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-900">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {plan.missingRates.length > 0 && <div className="mb-3"><Notice tone="amber">No IDR rate for {plan.missingRates.join(", ")}: those documents are rejected until you set a rate below.</Notice></div>}

      {isBooksImport(kind) && (
        <details className="mb-3 rounded-lg border border-slate-200 p-3" open={plan.missingRates.length > 0 || (kind === "qbo_trial_balance" && !!plan.blocking)}>
          <summary className="cursor-pointer text-sm font-medium">Options (entity{kind === "qbo_accounts" ? "" : kind === "qbo_trial_balance" ? ", cut-over date" : kind === "qbo_journal" ? ", date format, first date" : ", date format, rates, posting"})</summary>
          <form action={updateImportOptions} className="mt-3 space-y-3">
            <input type="hidden" name="kind" value={kind} />
            <BooksOptions kind={kind} options={options} entities={entities} own={own} />
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
        <>
          <p className="mb-2 text-xs text-ink-500">{kind === "qbo_accounts" || kind === "qbo_trial_balance" ? `First ${plan.sample.length} rows and the account each one maps to:` : `First ${plan.sample.length} of ${plan.toInsert} rows as they will be stored:`}</p>
          <CardTable bottom={false}>
            <table className="table table-data" style={{ minWidth: 60 + 200 + 150 * plan.columns.length }}>
              <Cols widths={[60, ...plan.columns.map(() => undefined), 200]} />
              <thead><tr><th className="num">Line</th>{plan.columns.map((c) => <th key={c}>{c}</th>)}<th>Notes</th></tr></thead>
              <tbody>
                {plan.sample.map((r) => (
                  <tr key={r.line}>
                    <td className="num text-ink-500">{r.line}</td>
                    {r.cells.map((c, i) => <td key={i}>{c ? <span className="cell" title={c}>{c}</span> : <Dash />}</td>)}
                    <td>{r.warnings.length > 0 ? <span className="cell text-amber-900" title={r.warnings.join("; ")}>{r.warnings.join("; ")}</span> : <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        </>
      ) : !plan.blocking && <p className="text-sm text-ink-500">Nothing new to {kind === "qbo_trial_balance" || kind === "qbo_journal" ? "post" : "insert"}{plan.rows === 0 ? ": no data rows were found. Check that the file is a CSV with a header line." : "."}</p>}

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {plan.duplicates.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">{plan.duplicates.length} duplicates (skipped)</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{plan.duplicates.slice(0, 200).map((d, i) => <li key={i}>line {d.line}: {d.label} — {d.reason}</li>)}</ul></details>}
        {plan.skipped.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">{plan.skipped.length} skipped</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{plan.skipped.slice(0, 200).map((d, i) => <li key={i}>line {d.line}: {d.reason}</li>)}</ul></details>}
        {plan.errors.length > 0 && <details className="text-xs" open><summary className="cursor-pointer font-medium text-red-700">{plan.errors.length} errors (rows not imported)</summary><ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">{plan.errors.slice(0, 200).map((d, i) => <li key={i}>line {d.line}: {d.message}</li>)}</ul></details>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canImport ? (
          <ConfirmForm action={runPendingImport} message={`${importLabel(plan)}${plan.entityName ? ` into ${plan.entityName}` : ""}? Duplicates are skipped.`}>
            <input type="hidden" name="kind" value={kind} />
            <SubmitButton pendingText="Importing…">{importLabel(plan)}</SubmitButton>
          </ConfirmForm>
        ) : <button className="btn-primary" disabled>Nothing to import</button>}
        <form action={discardPendingImport}><input type="hidden" name="kind" value={kind} /><button className="btn-secondary">Discard upload</button></form>
      </div>
    </Card>
  );
}
