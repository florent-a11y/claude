# ILA Office

Accounting and tax suite for **PT ILA Global Consulting**: multi-entity bookkeeping, Indonesian tax compliance,
payroll, invoicing, and a directory of client companies, contacts and vendors. The books module is multi-entity so the
same system keeps ILA's own accounts and the accounts of every client company ILA manages.

Stack: Next.js 15 (App Router) · React 19 · Tailwind 4 · Supabase (Postgres, optional) · zod. Runs with a local
JSON store when Supabase is not configured.

## Run locally
```bash
cd ila-office
npm install
cp .env.example .env.local
npm run seed      # admin user, ILA entity + chart of accounts, service catalogue, vendors, demo client
npm run dev       # http://localhost:3100
```
Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env.local` (or create the first admin on the login
page when no user exists).

## Checks
```bash
npm run typecheck && npm run test && npm run build
```

## Modules
| Area | Path | What it covers |
|---|---|---|
| Clients | `app/clients` | Directory of client companies (with their recurring engagements), contacts, vendors (notaries, Kanim agents, suppliers) and the price list used on ILA's invoices. |
| Books | `app/books/[entityId]` | Send-to-client button on invoices (PDF attached, ILA wording, Resend), chart of accounts (PSAK-style, bilingual), journals (manual entries editable in place with a revision history), sales invoices and purchase bills (PPN, withholding), receipts and payments, expenses and deposits recorded straight against a bank or cash account, supporting documents attached to invoices, bills, journals, expenses, deposits and assets, bank statement import (PDF e-statements from BCA, BNI, BRI, CIMB Niaga and Mandiri; OCBC xlsx, Mandiri Kopra csv, BNI xls and Aspire xlsx exports; any CSV with column mapping), monthly bank reconciliation with sign-off, fixed assets (fiscal groups), general ledger, trial balance, P&L (period or monthly columns), balance sheet, period locks; every report exports to CSV and Excel and the statements to PDF; amount fields format thousands as you type and account fields are type-ahead pickers. |
| Tax | `app/tax/[entityId]` | Compliance calendar per entity (the monthly milestones ILA runs: data by the 5th, prepare by the 10th, pay by the 10th, report by the 15th/20th, PPN by month end, LKPM quarterly, SPT Badan 30 April, SPT OP 31 March), PPh 21, PPh 23/26/4(2) bukti potong, PPN register, PPh 25, annual CIT computation, LKPM data pack. |
| Payroll | `app/payroll/[entityId]` | Employees, BPJS, monthly runs with PPh 21 TER and December true-up, payslips, journal posting; PPh 21 methods gross, nett (company-borne, non-deductible) and gross-up (taxable tax allowance), employee BPJS shares payable by the company as a taxable allowance. |
| Settings | `app/settings` | Entities (one per set of books), users and roles (team roles see every company; client logins see only the companies allocated to them, read-only), CSV imports (HubSpot contacts, QuickBooks customers and invoices). |

The sales CRM (deal pipeline, quotes, projects with cost of sales, renewals, tasks) was built and then set aside to
focus on accounting and tax first; it is preserved in git under the tag `with-crm-v1`.

## Storage
`lib/db.ts` is the only data-access layer. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, each
collection is a Postgres table with an `id` and a `data` jsonb column (`supabase/schema.sql`). Without them,
collections live in `data/*.json`. Domain types are in `lib/types.ts`.

## Deploy
Follow [DEPLOY.md](DEPLOY.md): a Supabase project (run `supabase/schema.sql`), a Vercel project with
**Root Directory = `ila-office`** and the environment variables from `.env.example`, then create the first
administrator on the sign-in page (it seeds ILA's entity, price list and vendors). Hosted installations refuse to
run without Supabase. Put the app behind Cloudflare Access or a VPN when real client data is in: it holds
passport, tax and bank data.
