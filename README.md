# Indonesia Arrival Card Assist

Private assistance service for the All Indonesia arrival card: guided form, human verification,
Airwallex card checkout, ops console, free DIY guide, customs calculator and official-news summaries.
See `docs/arrival-card-service-plan.md` for the business plan, legal position and budget, and
`docs/launch-checklist.md` for hosting, domain and go-live steps.

## Stack
Next.js 15 (App Router) · Tailwind 4 · Supabase (Postgres) · Airwallex Hosted Payment Page · Vercel

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in what you have; the app runs without Airwallex/Supabase in dev mode
npm run dev                   # http://localhost:3000
```
Without `SUPABASE_URL` the app stores orders in `data/orders.json` (dev only).
Without Airwallex keys, checkout skips payment and marks the order paid (dev only).

## Key paths
| Path | Purpose |
|---|---|
| `app/apply` | Guided form (arrival card, e-VOA, or bundle) → `POST /api/orders` → Airwallex hosted checkout |
| `app/evoa` | e-VOA landing page with eligibility checker and itemized government fee |
| `app/api/uploads` | Passport scan / photo uploads to a private Supabase Storage bucket |
| `app/api/webhooks/airwallex` | Marks orders paid/refunded (HMAC-verified) |
| `app/admin` | Ops CRM (HTTP basic auth): stats, views (to treat / new / window open / done), search, acknowledge, assignee, status pipeline, activity log, CSV export |
| `lib/email.ts`, `lib/sheets.ts` | New-order alert + customer confirmation (Resend); optional Google Sheet mirror of orders |
| `extension/` | Chrome extension: fills the official form from order JSON; a human reviews and submits |
| `app/api/news/refresh` | Cron (Vercel) that summarizes official announcements |
| `supabase/schema.sql` | Tables, RLS, 30-day passport-data purge |

## Checks
```bash
npm run typecheck && npm run build
```
