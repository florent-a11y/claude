# ILA Office — design document

Internal practice-management suite for **PT ILA Global Consulting** (Bali, Jakarta, Manila, Hong Kong).
One app for the whole firm: CRM and quotes, projects, multi-entity bookkeeping, Indonesian tax compliance, payroll.

Status: first working version. This document explains what it does, how it maps to the way ILA works today,
how it is built, and what comes next. Code lives in `ila-office/`; domain types are in `lib/types.ts`.

---

## 1. Purpose

ILA runs on five tools that do not talk to each other: HubSpot, QuickBooks Online, Google Sheets, Google Slides
and Google Drive. Nobody owns a task end to end. The monthly tax tracker is a spreadsheet with one tab per month.
Client passwords for bank, Coretax and OSS logins sit in plain spreadsheets.

ILA Office replaces the glue, not the strengths:

- One record per client, from first contact to monthly compliance.
- One tracker for every obligation of every entity, with an owner and a status.
- One set of books per entity (ILA itself and each client), double-entry, in IDR.
- Quotes, invoices and projects that share the same service catalogue and the same numbers.
- A dashboard that shows what is late today.

It is an internal tool. Four roles, a handful of users, behind Cloudflare Access.

---

## 2. How it maps to ILA's current way of working

| Today | In ILA Office | Notes |
|---|---|---|
| HubSpot contacts and companies | CRM → Contacts, Companies | Imported by CSV (Settings → Import). HubSpot Record ID kept for dedupe. |
| HubSpot deal pipeline (Prospect → Qualified → Quotation sent → Review → Invoice sent → Closed won/lost) | CRM → Deals | Same seven stages, same probabilities (20/40/60/80/90/100/0 %). Weighted pipeline on the dashboard. |
| Google Slides quotes | CRM → Quotes | Lines from the service catalogue, 7-day validity, ILA's standard terms, print to PDF. A quote becomes a project and an invoice. |
| QuickBooks invoices in IDR/USD/EUR/HKD | Books → ILA entity → Invoices | QBO history imported by CSV with the QBO number kept. New invoices are issued here. Due 3 working days after sending. Out-of-scope VAT by default (ILA is not PKP). |
| "Services" free-text lines in QBO | Service catalogue (`lib/catalogue.ts`) | ~100 priced services rebuilt from real quotes and invoices: working KITAS 43 M, investor KITAS 19.5 M, commercial address 5.5 M/yr, monthly tax 1.5 M, bookkeeping 1 M, QBO 260 k, PT PMA 17.5–30 M, due diligence 8.5 M, PBG staged… |
| Google Sheet "Client List Tax and Accounting" (rows = clients, columns = tasks per month) | Tax → All clients calendar and Tax → [entity] | One obligation row per entity, type and period, generated from the entity's tax profile. Statuses: not started → data requested → data received → in preparation → awaiting approval → paid → reported (or nil / late). |
| Cost-of-sales SOP (vendor, project owner approval) | CRM → Projects → Cost of sales | Each cost line names the vendor, the amount, and must be approved by the project owner before payment. Vendor list seeded from ILA's SOP (Kanim agents, notaries, BKPM, OSS, PBG…). |
| Client onboarding checklist (akta, NPWP + EFIN, SKT, NIB, director documents, OSS and Coretax logins) | Projects → Checklist; Entity profile | Checklist items on the project. Akta, NPWP, NIB on the entity. Logins go to the credentials vault (roadmap, section 6). |
| Google Drive folder per client | `driveFolderUrl` on contact, company, entity, project | Links only; files stay in Drive. |
| Gemini meeting notes | Activities (note / meeting / call / WhatsApp) | Paste the summary on the deal, project or company. |
| KITAS and licence expiry dates in people's heads | CRM → Renewals | Every project with an expiry creates a renewal; reminder window 60 days; renewal becomes a new deal. |
| Payroll in spreadsheets | Payroll → [entity] | Employees, BPJS, PPh 21 TER monthly, December true-up, payslips, journal. |

### The monthly rhythm (unchanged, now tracked)

| Day | Step | Where |
|---|---|---|
| 1st–5th | Request data from clients; chase | Obligation status `data_requested`; task to the accountant |
| 5th–10th | Bookkeeping, PPh 21/23/26/4(2) computation, PPN if PKP | Books, Tax → withholding, Payroll |
| 10th | Pay withholding taxes (NTPN recorded) | Obligation `paid` with NTPN |
| 15th–20th | Report monthly returns on Coretax; send reports | Obligation `reported` |
| Month end | PPN return (PKP only) | Obligation `ppn` |
| Quarterly | LKPM (every PT PMA) | Obligation `lkpm` per quarter |
| 31 March / 30 April | SPT OP / SPT Badan | Annual obligations, CIT computation in Tax |

---

## 3. Modules

### 3.1 Dashboard (`/`)
- Stats: weighted pipeline, open projects, renewals due within 60 days, tax obligations due this month by status, ILA's receivables, ILA's cash and bank balances (from the ledger).
- Lists: my open tasks, projects waiting on the client, renewals due soon, overdue obligations across all entities, recent activity, quick links and one link per client entity.

### 3.2 Clients directory (`/clients`)

Client companies (type, NPWP, NIB, region, primary contact, recurring engagements such as monthly tax and bookkeeping),
contacts (passport, nationality, language, Drive folder), vendors (notaries, Kanim and BKPM agents, government offices,
suppliers) and the price list used for ILA's own invoices. Each company links to its entity, so Books and Tax are one
click away. Notes and emails are logged on a timeline.

**A client is created once.** The company form carries the box "ILA keeps the books for this company", ticked by
default for a legal form (the dashboard's "New client" opens the form that way; a prospect leaves it unticked): saving
creates the company and its entity with the standard chart of accounts and the default tax profile, linked both ways,
so the client is available at once under Books, Tax, Payroll and the entity picker. The box stays on the edit form while
a company has no books. The legal details the two records share (name, NPWP, NIB, deed, address, region, Drive
folder) are entered once: what a save changes on one record is copied to the other.

The sales CRM built in the first iteration (deal pipeline with the HubSpot stages, quotes with the 7-day terms,
projects with checklists and cost of sales, renewals, tasks) is set aside to focus on accounting and tax first. It is
preserved in git under the tag `with-crm-v1` and can be restored later.

### 3.3 Books

Bank statements import directly from what ILA and its clients already receive: PDF e-statements from BCA, BNI, BRI,
CIMB Niaga and Mandiri, and the exports OCBC Velocity (xlsx), Mandiri Kopra (semicolon csv), BNIDirect (xls with merged
cells and D/K markers) and Aspire (xlsx, localised headers) produce. The format is detected automatically; any other
CSV or Excel file goes through manual column mapping. Scanned PDFs (no text layer) are refused with an explanation.
 (`/books/[entityId]`)
- One entity = one set of books. ILA's own entity is flagged `isOwn`.
- Chart of accounts (PSAK-style, bilingual, tax-tagged) created with the entity.
- Journals: manual and generated (invoice, bill, receipt, disbursement, bank, payroll, depreciation, withholding, opening, closing, adjustment, FX). Numbered JE-YYYY-NNNN per entity. Posted entries are voided, never deleted.
- Sales invoices (PPN or out of scope), purchase bills with withholding (PPh 23/26/4(2)/21), receipts and payments, transfers.
- Bank statement import with duplicate detection (a hash of date, amount and description, or the same date and running balance: a statement imported again after the reader improved is not stored twice, and its unmatched lines get their rupiah cents back, `ImportBatch.updated`): PDF e-statements (BCA, BNI, BRI, CIMB Niaga, Mandiri Kopra, OCBC NISP) are read from their text layer by position (`lib/pdf-text.ts`, `lib/bank-pdf.ts`), with the running balance used to verify every sign; OCBC, Mandiri, BNI and Aspire exports (xlsx/xls/csv) have presets; any other CSV/Excel is mapped column by column. Statement lines are matched to invoices, bills or journals. The OCBC NISP preset reads the bilingual "Rekening Koran Giro" (two dates, a description over several lines that may continue on the next page, debit / credit / balance on every row, figures wrapped in a narrow cell) and takes each currency from the "Currency Code" line that opens its section, not from the page header; a PDF from a bank without a preset goes through a generic reader (date at the start of the line in the usual formats, day-month dates taking the year of the statement period, amounts under the header's columns or at the end of the line, DB/CR marks, trailing minus, parentheses). The reader reports its own coverage: amounts keep their cents, every currency section is checked to the cent against its own running balance and against opening + movements = closing, and the import screen shows one line per section ("IDR: 42 lines read, opening + movements = closing ✓", "USD: 12 lines read, 1 gap in the running balance") with a warning naming the two dates between which a line may be missing. Scanned PDFs (no text layer) and password-protected PDFs cannot be read.
- Monthly bank reconciliation per account (`/books/[entityId]/reconciliation`): closing balance per statement vs balance per books, statement lines not yet booked, ledger entries not yet on the statement (ticked "on statement" when their line predates the imports), a printable reconciliation statement and a sign-off that settles the month (`BankAccount.reconciliations`, `reconciledThrough`).
- Fixed assets with Indonesian fiscal groups and straight-line or declining-balance depreciation. The register keeps itself up to date (`lib/asset-auto.ts`, `/books/[entityId]/assets`):
  - **Purchases register themselves.** Every debit line on a `fixed_asset` account in a posted bill, an expense, a statement line booked straight to an account, or a hand-written or recurring journal (source manual or adjustment) creates a `FixedAsset` flagged `needsReview`: cost = the debit in IDR, name = the line description (else the memo), acquisition date = the journal date, the accumulated-depreciation account of the same code family (1-2200 → 1-2210, else the first active one), depreciation expense 6-2100 (6-2110 for leasehold), a fiscal group guessed from the account (land, permanent building, group II vehicles, group I equipment, group IV as a placeholder for leasehold), straight line, the group's useful life. One asset per journal line (`sourceJournalId` + `sourceLineIndex`, plus `billId` / `paymentId`), so nothing registers twice; never from opening, closing, FX or depreciation entries, QuickBooks history (`sourceId` "qbo:…") or a disposal entry. A failure to register never undoes the posting. The Assets page shows "N assets were registered automatically and need review"; on the asset page the accountant confirms name, group, method, useful life, salvage value and accounts (`updateAsset`), or removes a line that was not a new asset. Until confirmed an asset is neither depreciated nor disposable; once depreciation is posted its name and schedule are fixed. Voiding the bill, expense or journal removes an asset nothing was posted on and otherwise keeps it with a note, flagged again; editing a manual journal re-points, re-prices, removes or adds the assets of the lines that changed.
  - **Automatic monthly depreciation.** The daily job (`/api/recurring/run`) calls `runAutoDepreciation` after the recurring documents: for every entity that is not closed, has `autoDepreciation` on (the default; a switch on the Assets page) and has active, confirmed assets, it runs `runDepreciation` for the last completed month (in the audit trail the cron shows as "Depreciation job"), so the 1st posts the month just ended, skipped months are caught up and nothing is posted twice. A locked period or any error is reported per entity in the response (`depreciation: { period, entities, posted, skipped }`) and never stops the run. The automatic run does not start a hand-registered asset that has never been depreciated and would reach back before that month (opening balances, migrated history: the earlier depreciation is usually in the ledger already); one manual "Run depreciation" starts it.
  - **Sale and disposal** (`disposeAsset`, figures from `disposalPreview` in `lib/ledger.ts`, shown live on the asset page): depreciation that is behind is first posted through the month before the disposal month (one journal dated that month's last day, source depreciation, `sourceId` `<assetId>:catchup`); the disposal entry then takes out cost and accumulated depreciation, books the proceeds (a bank account, other receivables when sold on credit, or none when scrapped) and sends the difference to "Gain on disposal of fixed assets" (7-1210) or "Loss on disposal of fixed assets" (8-1210), created on first use (next free code when taken). The asset stays in the register as disposed, under its own filter and out of the totals, with the entry (`disposalJournalId`) and the result (`disposalGainLoss`, positive = gain). Voiding the disposal entry puts the asset back in use.
  - **Sale from a bank line.** A money-in statement line offers "Sale of a fixed asset": it opens the chosen asset's Sell / dispose form with the line's date, amount and bank account, and the line is matched to the disposal entry when it is posted (the proceeds must equal an IDR line; a foreign-currency line keeps its amount and implied rate on the bank line). Deposits carry a hint to record a sale from the asset instead, since a deposit posted to a fixed-asset account cannot tell which asset was sold.
- Reports: general ledger, trial balance, P&L, balance sheet. Period locks per month.
- Multi-currency: documents keep their currency and `fxRate` (IDR per unit); the ledger is always IDR.

**Added from the team's first test round (October 2026):**

- **Expenses and Deposits** (`/books/[entityId]/expenses`, `/deposits`): money paid or received outside bills and invoices (bank charges, loan repayments, capital contributions, loans received, interest income). One form: bank or cash account, date, payee, memo, lines (account, description, amount in the account's currency, FX rate per line for foreign-currency accounts). Each entry stores a `Payment` (`kind` disbursement/receipt without a bill or invoice, `lines`, `payee`, `memo`) and posts one journal (`source: "bank"`, `sourceId` = payment id): expense Dr lines / Cr bank, deposit Dr bank / Cr lines, the bank line being the sum of the rounded line amounts. A line may be negative (never zero) and then posts on the opposite side: an expense takes the PPh 21/23/26/4(2) withheld from a payment as a negative line to the PPh payable account (the form's "+ PPh withheld" button adds it at the usual rate), a deposit a bank charge taken from the money received, so the bank line is the net amount; the total must stay positive. An unmatched statement line can be turned into an expense or deposit with one click ("Record as expense/deposit"), which also matches it. Voiding reverses the journal and un-matches the statement line. Until matched, the journal shows under "ledger entries not on the statement" in the bank reconciliation.
- **Attachments** (`lib/files.ts`, `components/Attachments.tsx`): invoices, bills, journal entries, expenses, deposits and fixed assets carry supporting documents (PDF, images, Excel, Word, CSV, text, email; 4 MB per file). Files live in the private Supabase Storage bucket `ila-office` when hosted and under `ILA_DATA_DIR/files` locally, keyed `<entityId>/<docType>/<docId>/<id>-<safe name>`; downloads go through `/api/books/[entityId]/files/...`, which checks the session and that the key belongs to the entity.
- **Journal edit**: manual, adjustment, opening, closing and FX entries can be corrected in place (same number). The previous version is kept under `revisions`, both the old and the new period must be open, and "on statement" ticks are dropped when a bank line changes. Entries generated by invoices, bills, payments, payroll or depreciation are not editable: fix the source document.
- **Reports**: P&L has a monthly-columns view (`?view=monthly`, up to 13 months plus Total). Every report exports to CSV and Excel (`?format=xlsx`, numeric cells), and P&L, balance sheet, trial balance and general ledger also to PDF (`?format=pdf`, `lib/report-pdf.ts`: company name bold and centred, repeated headers, page numbers). The P&L, balance sheet and trial balance hide zero balances and sections without balances by default, with a "Show zero balances" switch (`?zero=1`, carried into the exports) that lists every account of the chart. Printing centres the header and hides notes, links, tabs and buttons; the monthly view and the general ledger print landscape.
- **Inputs**: amount fields (`components/MoneyInput.tsx`) show thousands separators while typing and submit the raw number under the same field name; chart-of-accounts fields (`components/AccountPicker.tsx`) are type-ahead pickers (type part of the code or name, keyboard selection, grouped by type).
- **Exchange rates.** Every FX rate box (invoices, bills, expenses, deposits, transfers, receipts, payments, bank matching) fills itself from Bank Indonesia's Kurs Transaksi mid rate for the document date (`lib/fx.ts` reads BI's page, looks earlier days up through its date form, uses the last published day for weekends and holidays and caches every currency per day in `fx_rates`; a weekday Vercel cron calls `/api/fx/sync`). A typed rate is never overwritten; rates accept decimals in either notation.
- **FX revaluation (month end).** `Books › FX revaluation`: foreign-currency bank and cash accounts restated at BI's closing rate of the last day of the month; the foreign balance comes from the ledger (or the statement balance typed in), the unrealised difference posts in one entry dated the month end (source `fx`, accounts 7-1110 / 8-1110 created on first use) and can be voided and redone. Not reversed: the next month revalues from the latest closing rate. Receivables and payables keep their document rate and book the realised difference on settlement.
- **Recurring transactions.** `Books › Recurring`: any invoice, bill, expense, deposit or manual journal becomes a template with "Make recurring" (`recurring_templates`, `lib/recurring.ts` for the schedule, `lib/recurring-services.ts` for the posting): frequency (weekly, monthly, quarterly, six-monthly, annual), day of month clamped to short months (31 → 28 Feb → 31 Mar), start and optional end date, due days and, for invoices and bills, post immediately or create as draft. A daily Vercel cron (`/api/recurring/run`, 08:00 WIB, bearer `CRON_SECRET`) and the "Run due now" button create every occurrence dated on or before today through the ordinary services (`createInvoice`/`postInvoice`, `createBill`/`postBill`, `recordMoneyMove`, `postJournal`), foreign-currency documents at BI's mid rate of the occurrence date (the template's rate when BI has none). Each attempt is kept in `runs` with the number or the error (locked period, inactive account…); the template still advances so one bad month never blocks the next, and the list shows the failure in red. Pause/resume, edit of the schedule and next date, delete (documents already created stay).
- **Amounts and withholding options.** Every amount box accepts up to two decimals typed the Indonesian or the English way (8.500.000, 8,500,000.50, 1500,25), and the ledger keeps them: IDR is posted to the cent, like every other currency, so a bank statement with rupiah cents reconciles exactly (`roundMoney` in `lib/money.ts`). Whole rupiah are used only where the rules ask for them: PPN, withholding and payroll amounts (`roundTax`, `roundTaxDown`), monthly depreciation (the last month absorbs the cents) and the printed balance sheet and profit & loss, which are rounded at presentation (`balanceSheetInRupiah`, `profitAndLossInRupiah` in `lib/ledger.ts`) unless "Show cents" is ticked; the trial balance, the general ledger, the reconciliation and every data export stay exact. Screens print IDR cents only when an amount has some, except on the four statements when "Show cents" (`?cents=1`, applied as soon as it is ticked) is on: every figure then prints two decimals, whole amounts included ("Rp 2.500.000,00"; `fmtMoneyAt`, `reportDecimals`), on the page and in the PDF, Excel and CSV exports. The expense form's "+ PPh withheld" offers PPh 23, 21, 26, 4(2) and PPh final PP 55 (0.5% on an UMKM vendor, paid with PPh 4(2)); bills carry the same `pp55` withholding type and prefill a PPh 4(2) slip with the PP 55 object code.
- **Multi-currency statements.** A PDF that lists several accounts (OCBC prints the IDR, USD and EUR accounts in one file) comes back with every row tagged by its currency section, and one import stores them all: the screen lists each section with its destination (rules in `lib/bank-sections.ts`), the account it was opened from for its own currency, the entity's account kept in the other currency, or "Create a USD bank account…" when there is none (`POST /api/books/:entityId/bank/accounts`: name, and an unused bank GL account or a new one with the next free bank code), or "Do not import". Several accounts in one currency leave the choice to the user. The sections are stored one after the other through the ordinary import (one `ImportBatch` per account, duplicates skipped), so pressing the button again after an error only finishes what is left; the preview shows one section at a time. A password-protected e-statement is opened with the password typed on the import screen (sent with the file for that one read, never stored: `PdfPasswordError` in `lib/pdf-text.ts`).

### 3.4 Tax and compliance (`/tax`, `/tax/[entityId]`)
- Compliance calendar generated from the entity's profile: regime (PPh final 0.5 %, Art. 31E, normal 22 %, HK profits tax), PKP, PPh 25 instalment, local tax (PB1), LKPM, payroll.
- Withholding slips (bukti potong) for PPh 21/23/26/4(2)/15/22 with DJP object codes, NTPN.
- PPN register (output/input, e-Faktur numbers), PPh 25, annual CIT computation with fiscal reconciliation (deductible flag on accounts), LKPM data pack.
- All-clients view: every entity's obligations for the month, by status and assignee. This is the Google Sheet, with owners.

**Withholding slips, second round (October 2026).** Entry works the Coretax way: one search box finds the recipient by NPWP, NIK or name across vendors, client companies, contacts, employees and earlier recipients and fills the rest; a second box finds the object code by code or description (unlisted codes are accepted with a manual rate); then gross amount, reference document (type, number, date), tax period (follows the document date) and withholding date. Facility (SKB, DTP, P3B), treaty rate, rate override, DPP override and the correction flag sit under "More options". PPh 21 non-employee objects (21-100-07/08/09/10/04) carry a deemed DPP of 50% where the rules say so; the slip stores gross, DPP %, DPP, rate and tax. The slip page and the PDF (`lib/tax/bupot-pdf.ts`, `/api/tax/[entityId]/withholding/[slipId]/pdf`) follow the Coretax forms: BPPU for PPh 23/26/4(2)/15/22 and BP21 for PPh 21, with the A/B/C sections, NITKU (NPWP 16 digits + 000000 unless set), the signatory from the entity settings and the Coretax number once filed. Reporting stays in Coretax; the period export (`/withholding/export?period=&format=csv|xlsx|xml&kind=BPPU|BP21`) produces one row per slip in the Coretax import layout. The XML tag names follow DJP's published format as far as known and must be compared with the template downloaded from Coretax before the first upload.
- **Coretax bulk files.** The period's slips export in the exact layout of the templates downloaded from Coretax (e-Bupot › Impor): `BpuBulk` for BPPU (PPh 23/26/4(2)/15/22) and `Bp21Bulk` for BP21, with 16-digit TIN/CounterpartTin, the 6-digit NITKU branch codes, TaxCertificate, TaxObjectCode, TaxBase (or Gross + Deemed and the PTKP status for PPh 21), Rate in percent, Document/DocumentNumber/DocumentDate, GovTreasurerOpt, SP2DNumber and WithholdingDate. Payroll runs export the monthly employee file (`MmPayrollBulk`, BPMP) with Resident/Foreign, passport, PTKP status, position, object 21-100-01 (21-100-32 for foreign employees) and the TER rate; December and termination months belong on the annual A1 form and are left out. Tokens still to confirm on the first real upload: TaxCertificate values other than N/A (SKB, DTP, SKD) and Document values other than Invoice, Contract and StatementLetter (TaxInvoice, PaymentProof, Others).

### 3.5 Payroll (`/payroll/[entityId]`)
- Employees with PTKP status, BPJS options, allowances and deductions, contract type.
- Monthly runs: gross, employer and employee BPJS, PPh 21 (TER Jan–Nov, annual true-up in December), net pay, cost to company. Approval, payslips, journal posting.

**Tax methods and BPJS allowance (added October 2026).** Each employee carries a PPh 21 method:
- *Gross* (default): the tax is deducted from the employee's pay.
- *Nett*: the company pays the tax on top of the salary. The amount is remitted through PPh 21 payable like any other, booked to `6-1040 PPh 21 borne by company` (non-deductible for CIT, created automatically on first use) and not added to the employee's taxable income. Note for the tax team: since PMK 66/2023 the authorities may treat tax borne by the employer as a taxable benefit; gross-up is the conservative alternative.
- *Gross-up*: the company adds a tax allowance (tunjangan PPh 21) that is itself taxable, solved so that the tax on the grossed-up income equals the allowance (fixed-point iteration on the TER rate, and on the annual art. 17 computation in December or the termination month). The allowance is part of gross salary expense and of the PPh 21 base; take-home pay equals the agreed salary.

Independently of the method, the company can pay the employee's own BPJS shares (Kesehatan 1%, JHT 2%, JP 1%) as a taxable allowance: the allowance is added to gross and to the PPh 21 base, the deduction still appears on the payslip, so the employee's pay is unchanged and the company bears the contribution and the extra tax. Payslip lines store `taxMethod`, `bpjsAllowance`, `taxAllowance` and split `pph21` into `deducted` and `borneByCompany`; runs computed before this option read as gross.

**BPJS wage base.** An employee can carry a fixed BPJS wage base (`bpjsWageBase`); contributions are then computed on it instead of the actual basic salary plus allowances, for clients whose pay fluctuates while the reported wage is fixed. PPh 21 still follows the actual pay.


### 3.6 Settings (`/settings`)
- Entities (books), users and roles, the guided QuickBooks migration per company, single-file imports (CSV or Excel) with preview and history.
- **Audit trail (`/settings/audit`, admins).** Every write that goes through `lib/db.ts` appends an `audit_log` entry by itself (rules in `lib/audit.ts`): when, who (signed-in user, a named job, or "System"), action (created, edited, deleted, posted, voided, approved, paid, locked / unlocked, imported), the record's reference, a one-line summary ("status draft → sent · total 1,500,000 → 1,750,000") and the changed fields with old and new values. Not recorded: `counters`, `settings`, `fx_rates`, the log itself, password hashes and other secret-looking fields (a reset reads "password changed"), timestamp-only updates; a bulk insert of more than 20 rows is one "imported" entry with its row count. The page filters by entity, user, record type, action, dates and reference, and exports CSV (5,000 rows at most). The same list per entity is under Books → Audit log (team roles); journal entries, invoices, bills, expenses / deposits, payroll runs and bukti potong end with a "History" card (last 30 entries). Client logins see none of it.
- **Entities from client companies.** Settings → Entities → New accepts `?companyId=` and prefills the form from the directory record (name, legal name, type, country, NPWP, NIB, deed, address, Drive folder, the "Client company" link); Clients → Companies offers admins a "create books" link per company and a one-click "Create books for N companies without books" (one entity per active company with a legal form, standard chart of accounts, default tax profile normal CIT / not PKP / LKPM for a PT PMA / no payroll, linked both ways). Shared helper: `app/settings/entities/create-entity.ts`.
- **One creation, both records (November 2026).** A client's two records are created in one step and linked both ways: the company form creates the books (see 3.2), and Settings → Entities → New without a client company creates the directory record (status active, tag `books`; never for ILA's own entity). Nothing is created twice: an unlinked record of the same legal person (same NPWP or same name) is linked instead, in the forms and in the bulk action, and several candidates raise an error instead of a guess. A save on either record copies the shared legal details it changed to the other and fills a field empty on one side from the other; a value nobody touched never overwrites the other record. The Books list tells admins how many active clients still have no books (with the bulk button), and the company page asks for a review of the default tax profile during the first week. Writers: `create-entity.ts` (`ensureBooksForCompany`, `ensureCompanyForEntity`, `syncLegalDetails`); pure rules: `entity-sync.ts`, covered by `tests/entity-sync.test.ts`.
- **Migrate a company from QuickBooks (`/settings/import/quickbooks`, admins; first link on Settings → Import).** Guided and per company, for the complete history rather than a list of names.
  1. *Choose the company*: a set of books, or an active client company without books (they are created with `createEntityFromInput(entityInputFromCompany(company))` when the migration starts, after the dry run has passed).
  2. *Drop all the exports at once* (.xlsx, .xls, .csv; QuickBooks: Reports › Account List, Reports › Journal with Report period All Dates (one file per year if it is large), Reports › Trial Balance as of the last day QuickBooks was used, Reports › Invoice List or Open Invoices, Reports › Unpaid Bills, each via Export › Export to Excel). Each file is turned into a grid by `sheetsFromFile` (`lib/statement-file.ts`) and read by `tableFromGrid` (`lib/importers.ts`), which finds the header row under QuickBooks' title rows and returns the report title, company name and period printed above it; `detectQboReport` recognises the report from the title, else from the columns: Account List, Journal, Trial Balance, Invoice List / Open Invoices, Unpaid Bills / Bill list, Customer Contact List, Vendor (Supplier) Contact List, and General Ledger (recognised, not imported: "export the Journal report instead"). Per file the page shows the kind (with a select to override), the rows, what they amount to, the dates covered and the company printed in the file, with a warning when it is not the chosen company.
  3. *One plan, right order* (`buildMigrationPlan`, `lib/qbo-migration-services.ts`; rules in `lib/qbo-migration.ts`): chart of accounts, then the ledger, then vendors and customers, then documents. Every step is a planner of `lib/import-services.ts` handed the state the previous steps will leave (`PlanWorld`), so the preview and the import are the same plan. **With a Journal** the complete history is posted (one `manual` entry per QuickBooks transaction: date, type, number, name, memo, account lines, cents kept) and the Trial Balance is not posted: it is the check. **Without a Journal** the Trial Balance becomes the opening entry at its date. Invoices and bills never post from the wizard (`postToLedger` false): the Journal or the opening balances already carry them, so the open documents are records that are collected and paid in the app without double counting. QuickBooks' "Accounts Receivable (A/R)" and "Accounts Payable (A/P)" are mapped to the accounts tagged `ar_trade` / `ap_trade`, so those receipts and payments land on the migrated balances. Accounts used in the Journal or the Trial Balance but missing from the Account List (typically deleted in QuickBooks) are created from their name with a guessed type (`guessAccountFromName`) and listed as "created from the journal, check the type". A later run respects what is in the ledger: a Trial Balance on a migrated ledger is only compared, and a Journal added after opening balances posts only what is dated after them. The customer list of a client company is not added to ILA's directory unless asked (it is for ILA's own books); vendors go to the shared vendor directory, deduplicated by name.
  4. *Fast posting*: `postJournalsBulk` (`lib/posting.ts`) validates every entry with `validateLines`, refuses locked periods (locks loaded once), reserves the JE numbers of a year in one counter update (`db.reserveNumbers`) and stores the entries with `insertMany` in chunks of 500. The single-file journal import uses it too.
  5. *Proof* (`compareTrialBalance`): after the import, and later on demand, the books at the date of the Trial Balance file against the QuickBooks figures per account (Account · QuickBooks · App · Difference): green "Matches QuickBooks" when every difference is zero, else the differing accounts. QuickBooks posts no year-end close, so its trial balance shows income and expenses for the financial year and the earlier result in Retained Earnings: the app's figures are laid out the same way from the same entries (the layout with the fewest differences is kept, and named). The dry run already shows the expected result.
  6. *Status per company*: a `QboMigration` record in `settings` (`qbo_migration:<entityId>`): files imported (name, kind, rows, dates, when, by whom), counts (accounts created / mapped, journal entries, invoices, bills, vendors), the QuickBooks trial balance and the last check. The page lists every set of books as not started / in progress / checked OK / differences to review, with "Open books" and "Check again".
  7. *Limits*: the platform refuses a request body over 4.5 MB and stops a function after 300 s. The page (client component) sends the files to `POST /api/settings/import/quickbooks` (multipart, `maxDuration = 300`) in several requests of at most 4 MB, with one progress line per file; a single file over 4 MB, or of 60,000 rows or more (`QBO_MAX_ROWS`, about 20,000 transactions), is refused with the advice to export one year at a time or save as CSV. The parsed grids wait in `settings`, gzipped, between upload, preview and import, and are deleted after the import. Everything is idempotent (QBO name on the account, journal `sourceId`, document number), so re-running after adding a year file only adds what is missing. Unnumbered transactions of the same day and type, which QuickBooks allows, are told apart by a hash of their lines in the `sourceId`.
  Not imported from QuickBooks: the General Ledger report, attachments, bank feeds and reconciliations, recurring templates, budgets, payroll, inventory quantities, and payment records as documents (receipts and bill payments are in the ledger through the Journal, not linked to the invoice or bill).
- **Single files (`/settings/import`, below the migration link).** Eight imports, each previewed (dry run) before writing and recorded in `import_batches` (with `counts` per record type): HubSpot contacts and QuickBooks customers feed the directory; QuickBooks invoices, account list, trial balance, journal and bills write into the entity picked on the card (default ILA's own); QuickBooks vendors (written by the migration only) feed the vendor directory. Files are CSV or Excel (.xlsx, .xls, up to 4 MB; an Excel sheet goes through the same `tableFromGrid`). The customers card has "Create books for the imported companies" (on by default): after the commit every company that import inserted and that `companyNeedsBooks` gets its entity, and the notice reports "N sets of books created"; individuals are contacts and never get books. Pure parsers in `lib/importers.ts`, store logic in `lib/import-services.ts`. QBO accounts are matched to ours by number, then by stored QBO name, full name and leaf name (account numbers and "(deleted)" marks ignored), and remembered on `Account.qboName`; the trial balance becomes one `opening` journal (`sourceId qbo:tb:<date>`), the journal one `manual` entry per transaction (`sourceId qbo:<type>:<num>:<date>`), bills are keyed by `qboDocNumber`. Reports grouped by customer or vendor (Open Invoices, Unpaid Bills) take the name from the heading row.

---

## 4. Data model (summary of `lib/types.ts`)

Every record is a JSON document with an `id`. Conventions:

- Money: amounts are kept to two decimals in every currency, IDR included; tax amounts and the printed statements are whole rupiah. Foreign-currency documents carry `currency` and `fxRate` (IDR per unit). The ledger posts IDR.
- Dates: `YYYY-MM-DD`. Timestamps: ISO 8601. Periods: `YYYY-MM`, `YYYY-Qn`, `YYYY`.
- `entityId`: which set of books a record belongs to.

| Area | Tables | Key fields |
|---|---|---|
| Core | `users`, `entities`, `settings`, `counters` | role; entity type, country, `isOwn`, NPWP, NIB, tax profile (regime, PKP, PPN rate, PPh 25, local tax, LKPM, payroll), `crmCompanyId` |
| CRM | `contacts`, `companies`, `deals`, `services`, `quotes`, `projects`, `vendors`, `renewals`, `activities`, `tasks` | stage and probability; catalogue code, price IDR/USD/EUR, cadence, renewal months, tax treatment; project status, checklist, cost lines, `expiresAt`; renewal kind and `reminderDays` |
| Books | `accounts`, `journal_entries`, `periods`, `bank_accounts`, `bank_transactions`, `invoices`, `bills`, `payments`, `fixed_assets` | account subtype and `taxTag`; journal lines with debit/credit in IDR plus original currency; invoice `qboDocNumber`, `fakturNumber`, status draft/sent/partial/paid/void; bill withholding; bank transaction `hash` |
| Tax and payroll | `employees`, `payroll_runs`, `withholding_slips`, `vat_transactions`, `tax_obligations` | PTKP, BPJS flags; payslip lines with TER category; slip object code, DPP, rate, NTPN; obligation `${entityId}:${type}:${period}`, data/payment/report due dates, status, assignee |
| Imports | `import_batches` | kind, file, rows, inserted, skipped, errors, user |

Relationships are ids, not joins: `contact.companyIds`, `company.entityId`, `project.dealId`, `invoice.projectId`,
`renewal.projectId`, `obligation.entityId`. Document numbers come from `counters` per scope and year.

---

## 5. Architecture

- **Next.js 15 (App Router), React 19, TypeScript strict, Tailwind 4, zod 4.** Server components render pages; server actions handle every mutation. No client-side state library. Pages declare `dynamic = "force-dynamic"`.
- **Storage: `lib/db.ts`** is the only data layer. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` each table is a Postgres table `(id, entity_id, data jsonb)` (`supabase/schema.sql`, Singapore region, RLS on, service key server-side only). Without them, `data/*.json` files (development). The API is small on purpose: `list`, `get`, `getMany`, `insert`, `insertMany`, `upsert`, `update`, `remove`, `count`, `nextNumber`.
- **Ledger core:** `lib/posting.ts` validates, numbers and posts journals and refuses locked periods; `lib/balances.ts` is pure arithmetic shared by reports and tax computations; `lib/coa.ts` builds the chart of accounts; `lib/catalogue.ts` holds ILA's services.
- **Auth:** email + password (scrypt), HMAC-signed session cookie, Edge middleware that rejects anonymous requests, server-side re-check of the user record on every request. First user is created on the login page; `npm run seed` loads ILA's entity, catalogue, vendors and a fictional demo client.
- **Roles:** admin (everything), consultant (CRM write, read all), accountant / tax team (books, tax, payroll write, read all), viewer (read). Team roles see every company, contact, vendor and set of books. A **client** role gives a customer a read-only login limited to the entities allocated to it (`User.entityIds`): its own books, tax calendar, payroll and company record, with internal notes, activity, vendors, the price list and settings hidden. Rules live in `lib/access.ts`; `requireEntityAccess`, `requireTeam` and `guard(perm, entityId)` enforce them in layouts, actions and API routes, and `scopeEntities` filters every list.
- **Deployment:** Vercel (root directory `ila-office`) + Supabase. Environment: `SESSION_SECRET`, Supabase keys, optional `ANTHROPIC_API_KEY`.
- **Table conventions (`components/ui.tsx`, `app/globals.css`):** every list is a `table table-data` with a `<Cols>` column plan (fixed pixel widths for dates, numbers, statuses and actions; one or two flexible text columns), one line per cell (`cell` / `cell-primary` / `cell-sub` with the full text on hover), right-aligned `num` columns, `<Dash />` for empty values, totals in `<tfoot>`, `row-muted` for void or inactive rows. Full-width lists sit in `TableCard`, tables inside a card in `CardTable`. Financial statements (P&L, balance sheet, CIT computation, LKPM) use `table table-statement` with `row-section`, `row-total` and `row-grand` lines.

```
Browser ── Cloudflare Access ── Vercel (Next.js)
                                  │  server components + actions
                                  │  lib/auth · lib/db · lib/posting
                                  └── Supabase Postgres (jsonb documents, private storage bucket)
```

---

## 6. Security notes

- **Credentials vault (next step).** Client bank, Coretax, OSS, DJP and BPJS logins must leave the spreadsheets. Plan: a `credentials` table encrypted with AES-256-GCM using a key held only in the server environment (never in the database), one record per entity and system, reveal on click with an audit entry, admin-only export. Until then, do not type passwords into notes fields.
- **Network.** The app is internal. Put it behind Cloudflare Access (Google Workspace SSO, ILA domain only) or a VPN. No public sign-up. Supabase RLS blocks anonymous access; the service key is server-side only.
- **Accounts.** Four roles, least privilege. Deactivating a user locks them out on the next request. Login is rate-limited. Add TOTP second factor for admins and accountants (roadmap).
- **Audit trail.** Activities log who did what on CRM records. Journals are numbered sequentially per entity and year, posted entries are voided not deleted, every generated journal points to its source document. Import batches record file, counts, errors and user. Period locks prevent back-dated changes once a month is reported. The storage layer itself writes an append-only `audit_log` (who created, edited, deleted, posted, voided, approved, paid or locked each record, with date, time and changed values; secrets excluded), readable by admins in Settings → Audit log and per entity by the team; the app offers no way to edit or delete its entries.
- **Data protection.** Passport numbers, NIK, NPWP and salaries are personal data under Indonesia's PDP Law (UU 27/2022). Keep them in the app, not in chat or Drive copies. Set a retention rule (10 years for tax and accounting records per KUP; shorter for prospects that never became clients). Supabase in Singapore: document the cross-border transfer in the privacy notice.
- **Backups.** Supabase point-in-time recovery; weekly export of `data/*.json` equivalent to Drive for the file backend.
- **Secrets.** `SESSION_SECRET` ≥ 32 random characters in production. Never commit `.env.local`.

---

## 7. Migration plan

Order matters: ILA's entity first, then customers, then each client company's QuickBooks file through the migration wizard, then the tracker. Every import is previewed (dry run) and skips what already exists, so it can be re-run.

1. **Set up.** Create the first admin on the login page. Run the seed (ILA entity, chart of accounts, catalogue, vendors). Add users with roles. Review the service catalogue prices.
2. **QuickBooks customers** (Settings → Import, Single files, card 2). Export QBO → Sales → Customers → Export to Excel (or Reports → Customer Contact List); the Excel file is read as it is. The importer splits companies (PT, CV, Ltd, Pty, GmbH, Inc, Group, Holdings…) from people, reorders "Last, First", strips currency suffixes (" - USD") and keeps the QBO display name as `qboCustomerId`. Leave "Create books for the imported companies" ticked: every active company with a legal form that the import adds gets its set of books at once (individuals never do). Review companies with type `other` and set the legal form.
3. **HubSpot contacts** (card 1). Export HubSpot → Contacts → Export (CSV). Record ID, name, email, phone, lead status, create date, associated company, owner. Deduped by email and Record ID against step 2. Lead status and lifecycle stage become tags. Associated companies that do not exist yet are created as prospects. HubSpot deals: recreate the open ones by hand (usually fewer than twenty).
4. **Client entities.** Step 2 created the books of the imported companies. For the others, open a company and click "create books" (Settings → Entities → New prefilled from the company), or on Clients → Companies click "Create books for N companies without books" to create one entity per active client company in one go (standard chart of accounts, default tax profile, linked both ways); the migration wizard also creates the books of the company it is started for. Then review each entity's tax profile (regime, PKP, LKPM, payroll): the compliance calendar is generated from it.
5. **QuickBooks accounting data per company: the migration wizard** (Settings → Import → Migrate a company from QuickBooks). One company at a time:
   1. **Export from that company's QuickBooks file**, each via Export › Export to Excel: Reports › Account List; Reports › Journal (Report period: All Dates; one file per year if it is large); Reports › Trial Balance (as of the last day you used QuickBooks); Reports › Invoice List or Open Invoices; Reports › Unpaid Bills. Optional: Reports › Vendor Contact List.
   2. **Choose the company and drop all the files at once.** The kind of each file is recognised; check the company name printed in each file (a warning shows when it is not the chosen company) and the dates covered.
   3. **Read the plan.** Accounts first (new ones created, existing ones mapped, those found only in the journal listed for a type check), then the complete journal history, then open invoices and bills as documents without posting. The expected comparison with the QuickBooks trial balance is shown before anything is written; if accounts differ, a year of the journal is usually missing.
   4. **Start the migration**, then read the proof: "Matches QuickBooks" as of the trial balance date, or the list of differing accounts. Fix the type of the accounts created from the journal in Books → Accounts.
   5. **Later**: drop a further year of the journal, or a newer trial balance, on the same company; only what is missing is added, and "Check again" repeats the comparison.
   Without the Journal (history staying in QuickBooks) give the Trial Balance at the cut-over date instead: it is posted as the opening entry, with the open invoices and bills as documents. Then import the bank statements from the Bank tab of the books and reconcile. A single report can still be added from the Single files cards (account list, trial balance, journal, invoices, bills), with posting of invoices and bills as an option there.
6. **ILA's own books.** The same wizard with ILA's entity chosen (★): its customer list goes to the directory, its history to its ledger.
7. **Monthly tracker.** Take the current month's tab of the Google Sheet and set each obligation's status and assignee in Tax → All clients calendar. From then on the sheet is read-only.
8. **Renewals.** Enter active KITAS, commercial address, nominee and licence expiry dates (CRM → Renewals). Future projects create them automatically.
9. **Drive links.** Paste the client folder URL on each company and entity.
10. **Run in parallel for one month.** Issue invoices from ILA Office and mirror in QBO. Compare AR and bank at month end. Then stop issuing in QBO (keep it read-only for history).

---

## 8. Roadmap

- **Coretax formats.** Export e-Bupot unification and e-Faktur CSV/XML in the DJP layouts from withholding slips and the PPN register, so monthly reporting is upload-only.
- **Reminders.** WhatsApp (Business API) and email templates for data requests (by the 3rd), renewals (60/30/7 days), unpaid invoices. Sent from the obligation or renewal, logged as activities.
- **Client portal.** Clients upload documents, approve monthly reports and tax payments, download invoices and payslips. Replaces WhatsApp back-and-forth.
- **Bank feeds.** API or scheduled statement pulls (BCA, Mandiri, Permata, HSBC HK) into the bank import, with rules-based matching.
- **QuickBooks API two-way sync.** For clients who keep their own QBO: pull transactions, push journals. Replaces CSV.
- **Multi-office.** Philippines and Hong Kong entities with their own charts and tax calendars (HK profits tax two-tier, PH BIR filings), PHP and HKD base currencies.
- **Claude-assisted drafting.** Engagement letters, visa sponsor letters, GMS minutes, circular resolutions, client data-request emails, from templates plus the record. `ANTHROPIC_API_KEY` is already in the environment file.
- **Credentials vault.** See section 6. First security item after go-live.
- **Mobile.** The layout works on a phone; a PWA icon and WhatsApp deep links are cheap wins.

---

## 9. Open questions for Florent

1. Which legal entity issues which invoice? ILA Indonesia only, or also an HK/PH entity for foreign-currency clients? This decides how many `isOwn` entities exist.
2. QBO history: import all years, or only open invoices plus the current fiscal year?
3. FX rates for imported invoices: one rate per currency for the file, or QBO's rate per invoice (available when the export includes the Exchange rate column)?
4. Who approves cost-of-sales lines when the project owner is away? One deputy per category?
5. Monthly tracker: keep the day-by-day milestones (3rd, 5th, 10th, 15th, 20th) as separate statuses, or is the current status list enough?
6. Renewal reminders: 60 days for everything, or per kind (KITAS 90, commercial address 60, GMS 30)?
7. Should consultants see client books and payroll, or only the accountants and admins?
8. Retention: delete prospects that never converted after 24 months?
9. Credentials vault: who may reveal a client's bank login? Admin only, or the accountant assigned to the entity?
10. HubSpot deals: migrate open deals by hand, or do you want a deal CSV importer as well?
