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

### 3.2 CRM (`/crm`)
- **Contacts**: person, passport, nationality, language, WhatsApp, owner, tags, Drive folder, HubSpot/QBO ids.
- **Companies**: legal form (PT PMA, PT PMDN, PT Perorangan, CV, HK Ltd, PH OPC…), NPWP, NIB, akta, region, status, recurring subscriptions (monthly tax, bookkeeping, payroll), link to the entity whose books ILA keeps.
- **Deals**: seven stages, amount and currency, category, owner, expected close, next step, lost reason. Kanban and list.
- **Quotes**: numbered Q-YYYY-NNNN, lines from the catalogue, discount, validity, terms, scope notes, documents needed. Statuses draft → sent → accepted/declined/expired. Printable.
- **Projects**: numbered P-YYYY-NNNN. Category, service, client, subject (visa holder, director), fee, status (new, waiting client, waiting payment, in progress, submitted to authority, done, cancelled), owner and assignee, checklist, cost-of-sales lines with approval, dates, expiry → renewal.
- **Vendors**: Kanim agents, notaries, BKPM, OSS, PBG, PUPR, SKTT, SIM, DORA, banks.
- **Renewals**: KITAS, visa, passport, commercial address, resident director, commissioner, local shareholder, licence, GMS, LKPM. Status upcoming → reminded → quoted → renewed / lapsed.
- **Activities and tasks**: notes, calls, emails, WhatsApp, meetings, status changes; tasks with due date, assignee and the record they relate to.

### 3.3 Books (`/books/[entityId]`)
- One entity = one set of books. ILA's own entity is flagged `isOwn`.
- Chart of accounts (PSAK-style, bilingual, tax-tagged) created with the entity.
- Journals: manual and generated (invoice, bill, receipt, disbursement, bank, payroll, depreciation, withholding, opening, closing, adjustment, FX). Numbered JE-YYYY-NNNN per entity. Posted entries are voided, never deleted.
- Sales invoices (PPN or out of scope), purchase bills with withholding (PPh 23/26/4(2)/21), receipts and payments, transfers.
- Bank CSV import with duplicate detection (hash) and reconciliation.
- Fixed assets with Indonesian fiscal groups and straight-line or declining-balance depreciation.
- Reports: general ledger, trial balance, P&L, balance sheet. Period locks per month.
- Multi-currency: documents keep their currency and `fxRate` (IDR per unit); the ledger is always IDR.

### 3.4 Tax and compliance (`/tax`, `/tax/[entityId]`)
- Compliance calendar generated from the entity's profile: regime (PPh final 0.5 %, Art. 31E, normal 22 %, HK profits tax), PKP, PPh 25 instalment, local tax (PB1), LKPM, payroll.
- Withholding slips (bukti potong) for PPh 21/23/26/4(2)/15/22 with DJP object codes, NTPN.
- PPN register (output/input, e-Faktur numbers), PPh 25, annual CIT computation with fiscal reconciliation (deductible flag on accounts), LKPM data pack.
- All-clients view: every entity's obligations for the month, by status and assignee. This is the Google Sheet, with owners.

### 3.5 Payroll (`/payroll/[entityId]`)
- Employees with PTKP status, BPJS options, allowances and deductions, contract type.
- Monthly runs: gross, employer and employee BPJS, PPh 21 (TER Jan–Nov, annual true-up in December), net pay, cost to company. Approval, payslips, journal posting.

### 3.6 Settings (`/settings`)
- Entities (books), users and roles, CSV imports with preview and history.

---

## 4. Data model (summary of `lib/types.ts`)

Every record is a JSON document with an `id`. Conventions:

- Money: IDR amounts are whole rupiah. Foreign-currency documents carry `currency` and `fxRate` (IDR per unit). The ledger posts IDR.
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
- **Roles:** admin (everything), consultant (CRM write, read all), accountant (books, tax, payroll write, read all), viewer (read). Checked by `requirePermission` in every action.
- **Deployment:** Vercel (root directory `ila-office`) + Supabase. Environment: `SESSION_SECRET`, Supabase keys, optional `ANTHROPIC_API_KEY`.

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
- **Audit trail.** Activities log who did what on CRM records. Journals are numbered sequentially per entity and year, posted entries are voided not deleted, every generated journal points to its source document. Import batches record file, counts, errors and user. Period locks prevent back-dated changes once a month is reported.
- **Data protection.** Passport numbers, NIK, NPWP and salaries are personal data under Indonesia's PDP Law (UU 27/2022). Keep them in the app, not in chat or Drive copies. Set a retention rule (10 years for tax and accounting records per KUP; shorter for prospects that never became clients). Supabase in Singapore: document the cross-border transfer in the privacy notice.
- **Backups.** Supabase point-in-time recovery; weekly export of `data/*.json` equivalent to Drive for the file backend.
- **Secrets.** `SESSION_SECRET` ≥ 32 random characters in production. Never commit `.env.local`.

---

## 7. Migration plan

Order matters: entities first, then customers, then invoices, then the tracker. Each CSV import is previewed (dry run) and skips rows that already exist, so it can be re-run.

1. **Set up.** Create the first admin on the login page. Run the seed (ILA entity, chart of accounts, catalogue, vendors). Add users with roles. Review the service catalogue prices.
2. **QuickBooks customers** (Settings → Import, card 2). Export QBO → Sales → Customers → Export to Excel → save as CSV. The importer splits companies (PT, CV, Ltd, Pty, GmbH, Inc, Group, Holdings…) from people, reorders "Last, First", strips currency suffixes (" - USD") and keeps the QBO display name as `qboCustomerId`. Review companies with type `other` and set the legal form.
3. **HubSpot contacts** (card 1). Export HubSpot → Contacts → Export (CSV). Record ID, name, email, phone, lead status, create date, associated company, owner. Deduped by email and Record ID against step 2. Lead status and lifecycle stage become tags. Associated companies that do not exist yet are created as prospects. HubSpot deals: recreate the open ones by hand (usually fewer than twenty).
4. **Client entities.** For each company whose books or tax ILA manages, create an entity (Settings → Entities) with its tax profile. Link it to the CRM company. The compliance calendar is generated from the profile.
5. **QuickBooks invoices** (card 3). Export QBO → Reports → Invoice List for the period you want in the system (at least the open invoices; ideally the current fiscal year). Choose the date format, set an IDR rate per currency, tick "Post to the ledger" to create Dr Accounts receivable / Cr Service revenue per invoice. Receipts are not imported; match them from the bank statement import. Invoices already present (same QBO number) are never imported or posted twice.
6. **Opening balances.** Post one opening journal per entity as at the cut-over date (bank, AR not covered by step 5, AP, fixed assets, equity) from the QBO balance sheet.
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
