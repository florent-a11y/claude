# Vitanadi: Bali vitality and biohacking storefront

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

## Blog (`/admin/blog`, public at `/blog`)

Articles are written in the console, in Markdown with a toolbar and a live preview. Each article is in one
language; link the translations together in the editor so each reader gets their version and search engines
get the right language links. An article carries what search engines and AI assistants look for: a summary,
key takeaways, section headings, sources, questions with answers, the author and the reviewing doctor. The
checklist beside the editor shows what is still missing.

Published articles appear on `/blog`, in `sitemap.xml`, in the Atom feed (`/api/feed/<language>`), and as
plain Markdown for AI assistants (`/api/blog/<language>/<address>`). The sample articles (`lib/blog-seed.ts`)
were written without a doctor: review or delete them before launch. A test site adds them once by itself;
elsewhere, use the button on the empty Blog screen.

## SEO & AI (`/admin/seo`)

One screen to manage how the site presents itself to search engines and AI assistants:

- **Health check**: reads the site's own settings and articles and lists what to fix (visibility, own domain,
  title and description lengths, AI access, articles per language, doctor review, business details, search
  consoles). It does not measure rankings.
- **Titles and descriptions**: for the ten main pages and every product page, in the three languages, with a
  character count and a search-result preview. Anything left empty uses the built-in wording
  (`"Seo"` in `messages/*.json`).
- **AI access**: which AI crawlers may read the public pages; written to `/robots.txt`. Crawlers that answer
  questions (ChatGPT search, Claude, Perplexity…) are listed apart from those that collect training text.
- **Facts for AI**: the statements about the business published in `/llms.txt`.
- **Search engines**: ownership codes for Google Search Console, Bing Webmaster Tools and Yandex Webmaster,
  and an IndexNow key that announces each new article to Bing and Yandex when it is published.

The settings are stored with the orders (table `clinic_settings`, or the test site's Blob store). On a test
site (`DEMO_MODE=on`) everything can be prepared, but crawlers are kept out until launch.

## Where to change things

| What | Where |
|---|---|
| Brand name, WhatsApp, address, company, dispensing facility | environment variables (see `.env.example`), defaults in `lib/config.ts` |
| Products, prices, which items need a doctor | `lib/catalog.ts` |
| Product wording, all site copy | `messages/en.json`, then `messages/ru.json` and `messages/fr.json` (a missing translation shows the English) |
| Search titles and descriptions | console, **SEO & AI**; the built-in wording is under `"Seo"` in `messages/*.json` |
| AI crawler list | `AI_CRAWLERS` in `lib/seo-settings.ts` (new crawlers appear over time) |
| Service areas, delivery and call-out fees, free-delivery threshold, opening hours, arrival windows | `lib/config.ts` |
| Terms, privacy, medical disclaimer, refunds (English only) | `lib/legal.ts` |
| Colours and typeface | `app/globals.css` (palette at the top; the typeface is Onest, which covers Latin and Cyrillic) |
| Photographs | files in `photos/`, listed in `lib/photos.ts`; each product names its photo in `lib/catalog.ts`. To swap one, replace the file under the same name |

## Before launch

Sample content to replace:

- [ ] Brand name: "Vitanadi" (vita = life, nadi = pulse, with NAD inside). Before relying on it, check the Indonesian
      trademark register (PDKI, classes 44, 5 and 35) and register the domain; it changes in one place, `lib/config.ts`
- [ ] The whole catalogue in `lib/catalog.ts` and `messages/*.json`: products, contents, **prices**
- [ ] Zones and fees in `lib/config.ts`
- [ ] WhatsApp number, email, lounge address, company name
- [ ] Photographs: the site ships with free stock photos from Pexels (sources in `photos/CREDITS.md`). They are
      illustrative, not pictures of your lounge, team or products, and the site says so. Replace them with your own
      photography when you have it. Do not add stock photos in which a recognisable person appears to use or
      endorse a medical product
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

## Test site

> **Current test deployment (18 Nov 2026):** <https://vitanadi.vercel.app>, Vercel project `vitanadi` in the ILA team
> (root directory `clinic`, functions in Singapore), built from the branch `claude/eager-sagan-k33nma`.
> `DEMO_MODE=on`; test orders are kept in the private Blob store `vitanadi-test-orders`. The two console
> passwords are in Vercel > vitanadi > Settings > Environment Variables (`ADMIN_PASSWORD`, `DOCTOR_PASSWORD`).
> The address is public to anyone who has it. A push to the branch builds a preview only: to update
> vitanadi.vercel.app, redeploy the branch to production in Vercel.


Set `DEMO_MODE=on` for a deployment that is only for looking around. It shows a "test site" banner on every page,
keeps search engines away, offers the online payment methods as simulations, and keeps orders in a private
Vercel Blob store connected to the project when no database is set. Remove it on the site that takes real
orders: without a database and without `DEMO_MODE`, a hosted site refuses to store orders.

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
