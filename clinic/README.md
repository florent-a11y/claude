# Bali recovery clinic storefront (working name: Pulih)

Website and ops console for a Bali recovery and longevity service: IV drips, doctor-reviewed peptides,
supplements and memberships, sold and delivered in Bali only. English, Russian and French.

A separate app from the two others in this repository (same stack: Next.js 15, Tailwind 4, Supabase, Vercel).

## Run locally

```bash
cd clinic
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD and DOCTOR_PASSWORD; the rest can stay empty
npm run dev                   # http://localhost:3200
```

Without Supabase keys, orders are kept in `data/orders.json`. Without payment keys, the two online methods are
offered as test payments that mark the order paid. Both shortcuts exist in development only.

```bash
npm run typecheck && npm test && npm run build
```

## How an order moves

| Basket contains | What happens |
|---|---|
| Peptides, NAD+ infusion (`rx: true`) | Health questionnaire → **doctor review** → customer gets a link → pays → confirmed |
| IV drips, injections (`session: true`) | Health questionnaire, place and arrival window → pays → nurse screens on site |
| Supplements | Address or collection → pays → delivered |
| Membership | Pays → team books sessions on WhatsApp |

Nothing that needs a doctor's review can be paid before the doctor approves it; the server enforces this, not
only the page. The doctor can approve part of a request: refused items are removed and totals recomputed.

Statuses: `awaiting_review` → `awaiting_payment` → (`payment_review` for bank transfers) → `confirmed` →
`out_for_delivery` → `completed`, plus `declined`, `cancelled`, `refunded`.

The customer follows the order on a private link (`/order/<id>?t=<secret>`), sent by email when email is set up
and available as a ready-made WhatsApp message in the console.

## Console (`/admin`)

Two sign-ins (browser password prompt):

- **ops** (`ADMIN_USER` / `ADMIN_PASSWORD`): orders, payment confirmation, delivery, messages. Cannot see health
  questionnaires and cannot approve prescription items.
- **doctor** (`DOCTOR_USER` / `DOCTOR_PASSWORD`): everything ops can do, plus the questionnaire and the
  approve / decline decision with a note to the patient.

Every action is written to the order's activity log with who did it.

## Where to change things

| What | Where |
|---|---|
| Brand name, WhatsApp, address, company, dispensing facility | environment variables (see `.env.example`), defaults in `lib/config.ts` |
| Products, prices, which items need a doctor | `lib/catalog.ts` |
| Product wording, all site copy | `messages/en.json`, then `messages/ru.json` and `messages/fr.json` (a missing translation shows the English) |
| Service areas, delivery and call-out fees, free-delivery threshold, opening hours, arrival windows | `lib/config.ts` |
| Terms, privacy, medical disclaimer, refunds (English only) | `lib/legal.ts` |
| Colours and fonts | `app/globals.css` |
| Hero and product illustrations (swap for photography) | `components/HeroArt.tsx`, `components/ProductArt.tsx` |

## Before launch

Sample content to replace:

- [ ] Brand name (working name "Pulih") and domain
- [ ] The whole catalogue in `lib/catalog.ts` and `messages/*.json`: products, contents, **prices**
- [ ] Zones and fees in `lib/config.ts`
- [ ] WhatsApp number, email, lounge address, company name
- [ ] Legal pages in `lib/legal.ts`: reviewed by an Indonesian health-law adviser, with your real cancellation and
      return terms
- [ ] Every statement the copy makes about the service must be true on day one: licensed doctors review every
      prescription item, nurses give the drips, chilled delivery, opening hours

Set-up:

1. **Database**: create a Supabase project (Singapore), run `supabase/schema.sql` in the SQL editor, set
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Required: a serverless host does not keep local files.
2. **Hosting**: Vercel > Add New > Project > import this repository > Root Directory `clinic`. Add the
   environment variables from `.env.example`. Choose the Singapore region for functions.
3. **Xendit** (QRIS, virtual accounts, e-wallets): `XENDIT_SECRET_KEY`, then in Xendit > Settings > Webhooks set
   "Invoices paid" to `https://<domain>/api/webhooks/xendit` and copy the verification token to
   `XENDIT_CALLBACK_TOKEN`. Try a payment with a development key first: this integration has not been run
   against a live Xendit account.
4. **Airwallex** (international cards): API keys, `IDR_PER_USD`, webhook `https://<domain>/api/webhooks/airwallex`
   for `payment_intent.succeeded`, secret in `AIRWALLEX_WEBHOOK_SECRET`. Not yet run against a live account either.
5. **Bank transfer**: `BANK_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER`.
6. **Email** (optional): Resend key, `EMAIL_FROM`, `OPS_EMAIL`.
7. Ask each payment provider in writing whether it accepts this business category before relying on it.

## Not built yet

- Live availability calendar: customers request a two-hour window, the team confirms on WhatsApp.
- Automatic membership renewal and member discounts at checkout: renewed and applied by hand.
- Stock levels.
- Indonesian-language pages.

## Data protection

Health questionnaires are sensitive personal data under Indonesia's Law No. 27 of 2022. They are stored only
when the basket needs them, shown only to the doctor sign-in, never sent by email, and the tables are closed to
the public database key (row-level security with no policies). Use strong, separate passwords for the two
console sign-ins and give the doctor password only to the doctors.
