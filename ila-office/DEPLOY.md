# ILA Office online: Vercel + Supabase

This puts ILA Office on a web address your team signs in to, with the data in a Postgres database in Singapore.

> **Current installation (26 Oct 2026):** the app runs at <https://ila-office.vercel.app> from the `main` branch,
> Vercel project `ila-office` (functions in Singapore), Supabase project `ila-office` (`qrrcsfznyppiirpxejxs`,
> Singapore). The steps below are kept for a rebuild or a second installation.

Budget about 30 minutes. You need a GitHub account that can see the repository (you have one), a Supabase account
and a Vercel account; both sign up with GitHub.

## 1. Database (Supabase, ~10 minutes)

1. Go to <https://supabase.com>, sign in with GitHub, create an organisation (ILA Global Consulting).
2. **New project**: name `ila-office`, region **Southeast Asia (Singapore)**, generate a strong database password
   and save it in your password manager (the app does not use it, but you need it for backups).
3. When the project is ready, open **SQL Editor → New query**, paste the whole content of
   `ila-office/supabase/schema.sql` (open it on GitHub, click *Raw*, select all, copy) and press **Run**.
   It creates the 24 tables the app uses. Running it again later is harmless.
4. Open **Project Settings → API** and copy two values for the next step:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - a **secret key**: under *Secret keys* click *Create new API key*, name it `vercel` and copy the `sb_secret_…`
     value (shown once; it can be revoked on its own later). The legacy `service_role` key works too. Either one
     bypasses every database rule: paste it only into Vercel, never into a chat, a document or the browser.

## 2. Hosting (Vercel, ~10 minutes)

1. Go to <https://vercel.com>, sign in with GitHub, **Add New… → Project**, import `florent-a11y/claude`.
2. In the import screen:
   - **Root Directory**: click *Edit* and choose `ila-office`. (Framework is detected as Next.js.)
   - **Environment Variables**: add these, one by one.

     | Name | Value |
     |---|---|
     | `SESSION_SECRET` | a long random string: in Terminal run `openssl rand -base64 48` and paste the result |
     | `SUPABASE_URL` | the Project URL from step 1 |
     | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1 |
     | `RESEND_API_KEY` | optional, for the *Send to client* button on invoices (see §6) |
     | `EMAIL_FROM` | optional, e.g. `PT ILA Global Consulting <invoices@ilaglobalconsulting.com>` |
     | `EMAIL_REPLY_TO` | optional, e.g. `florent@ilaglobalconsulting.com` |

3. Press **Deploy** and wait for the confetti (1–2 minutes).
4. Production deploys from `main`; every merge into `main` redeploys automatically. In **Settings → Functions**
   set the region to Singapore (`sin1`) so the app runs next to the database.
5. Open the deployment URL (something like `https://claude-xyz.vercel.app`). Add `/api/health` to it: you
   should see `"storage":"supabase","database":"ok"`. If it says `missing-schema`, step 1.3 did not run;
   if `unconfigured`, the environment variables are missing or the deployment predates them (redeploy).

## 3. First login (2 minutes)

Open the URL. The sign-in page offers **Create the first administrator**: enter your name, email and a password
of at least 10 characters. The app then loads ILA's own entity with its chart of accounts, the price list and the
vendor list, and (if you leave the box ticked) a fictional demo client with its own books for the team to
practise on. You land on the dashboard signed in as admin.

## 4. Staff accounts

**Settings → Users → Add a user.** One account per person, with the role that matches the job:

| Role | Sees | Can change |
|---|---|---|
| Admin | everything | everything, including users and entities |
| Accountant (tax team) | everything | books, bank reconciliation, tax, payroll |
| Consultant | everything | client companies, contacts, vendors, price list |
| Viewer | everything | nothing |
| Client | only the companies allocated to it | nothing |

Give each person a temporary password and ask them to tell you when they are in; you can reset a password
from the same page at any time (there is no self-service reset yet). Everyone signs in at the same URL.

## 5. Client logins (optional)

Create the user with the role **Client** and tick the companies it may see. The client gets its own
dashboard (upcoming filings, cash position), its books, tax calendar and bank reconciliation, read-only.

## 6. Nice to have

- **Your own address**: Vercel → Settings → Domains → add `office.ilaglobalconsulting.com`, then create the
  CNAME record Vercel shows at your DNS provider. HTTPS is automatic.
- **Invoice emails**: create a free account at <https://resend.com>, verify the domain
  `ilaglobalconsulting.com` (three DNS records), create an API key and set `RESEND_API_KEY` and `EMAIL_FROM`
  in Vercel → Settings → Environment Variables, then redeploy. Until then the Send button opens your mail app
  with the PDF to attach.
- **Updates**: every change merged into `main` redeploys automatically; the team just reloads.

## 7. Plans, cost and safety

- Vercel's free *Hobby* plan is for personal projects; company use needs **Pro** (about USD 20 per month per
  team member). Supabase's free plan **pauses a project after a week without traffic**; move to **Pro**
  (about USD 25 per month, includes daily backups) once real client data is in. Both cancel any time.
- Turn on two-factor authentication on GitHub, Vercel and Supabase. The database holds passports, tax and
  bank data: when the team is comfortable, put the address behind Cloudflare Access or a VPN as well.
- The laptop copy keeps working for experiments; its data is separate from the online database. Nothing from
  the laptop is uploaded automatically.

## 8. If something goes wrong

| Symptom | Fix |
|---|---|
| Build fails on Vercel | Root Directory must be `ila-office` (Settings → General). |
| Page says "Database not configured" | Add the three environment variables in Vercel and redeploy. |
| `/api/health` says `missing-schema` | Run `supabase/schema.sql` in the Supabase SQL editor. |
| Nobody can sign in | On your Mac, put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `ila-office/.env.local`, then `npm run reset-password -- you@ilaglobalconsulting.com "new password"`. It works against the online database. |
| Invoice email does not send | Resend is not configured (see §6); the mailto fallback still works. |
