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
| Books | `app/books/[entityId]` | Send-to-client button on invoices (PDF attached, ILA wording, Resend), chart of accounts (PSAK-style, bilingual), journals, sales invoices and purchase bills (PPN, withholding), receipts and payments, bank statement import (OCBC xlsx, Mandiri Kopra csv, BNI xls, Aspire xlsx, or any CSV with column mapping) and reconciliation, fixed assets (fiscal groups), general ledger, trial balance, P&L, balance sheet, period locks. |
| Tax | `app/tax/[entityId]` | Compliance calendar per entity (the monthly milestones ILA runs: data by the 5th, prepare by the 10th, pay by the 10th, report by the 15th/20th, PPN by month end, LKPM quarterly, SPT Badan 30 April, SPT OP 31 March), PPh 21, PPh 23/26/4(2) bukti potong, PPN register, PPh 25, annual CIT computation, LKPM data pack. |
| Payroll | `app/payroll/[entityId]` | Employees, BPJS, monthly runs with PPh 21 TER and December true-up, payslips, journal posting. |
| Settings | `app/settings` | Entities (one per set of books), users and roles, CSV imports (HubSpot contacts, QuickBooks customers and invoices). |

The sales CRM (deal pipeline, quotes, projects with cost of sales, renewals, tasks) was built and then set aside to
focus on accounting and tax first; it is preserved in git under the tag `with-crm-v1`.

## Storage
`lib/db.ts` is the only data-access layer. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, each
collection is a Postgres table with an `id` and a `data` jsonb column (`supabase/schema.sql`). Without them,
collections live in `data/*.json`. Domain types are in `lib/types.ts`.

## Deploy
Import the repository in Vercel with **Root Directory = `ila-office`**, set the environment variables from
`.env.example`, and run `supabase/schema.sql` in the Supabase SQL editor (Singapore region). Put the app behind
Cloudflare Access or a VPN: it holds client passport, tax and bank data.
