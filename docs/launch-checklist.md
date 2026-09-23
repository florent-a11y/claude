# Launch checklist: hosting, domain, payments, ads

## 1. Hosting (recommended: Vercel + Cloudflare)

| Layer | Choice | Why | Cost |
|---|---|---|---|
| App hosting | **Vercel Pro** (region: Singapore `sin1`) | Native Next.js, cron for the news feed, preview deploys per branch | USD 20/mo |
| DNS / WAF / CDN | **Cloudflare** (free or Pro) | Bot Fight Mode, rate limiting on `/api/orders`, DDoS, hides origin | USD 0–20/mo |
| Database | **Supabase Pro** (Singapore) | Postgres, RLS, pg_cron for the 30-day passport purge, daily backups | USD 25/mo |
| Email | Resend | Transactional delivery of QR + reminders | USD 0–20/mo |
| WhatsApp | Twilio WhatsApp Business API | QR delivery + support | usage-based |

Alternative if you prefer one vendor: Cloudflare Pages + Workers with `@opennextjs/cloudflare`. Cheaper but more setup work. Do not host in Indonesia: the PDP Law does not require it and it complicates the tax picture for the HK entity.

Steps:
1. Import this GitHub repo in Vercel → Framework Next.js, Root Directory `/`.
2. Set environment variables from `.env.example` in Vercel (Production + Preview).
3. Add the custom domain in Vercel, point DNS at Cloudflare (proxied, SSL "Full (strict)").
4. Cloudflare rules: rate-limit `POST /api/orders` to 10/min per IP; enable Bot Fight Mode.
5. Vercel cron is defined in `vercel.json` (news refresh Mon/Thu 02:00 UTC). Set `CRON_SECRET`; Vercel sends it as the bearer token automatically.

## 2. Domain

Live domain: **www.allindonesia-arrivalcard.com** (apex redirects to www). Registered at Cloudflare, served by Vercel.

DNS at Cloudflare, both records **DNS only** (grey cloud), Cloudflare proxy kept off:

| Type | Name | Content |
|---|---|---|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |

Cloudflare SSL/TLS mode: Full (strict). `NEXT_PUBLIC_SITE_URL=https://www.allindonesia-arrivalcard.com` in Vercel, then redeploy.

Note: the name contains "allindonesia", the government programme's brand; keep a neutral fallback domain (e.g. indonesiaarrivalcard.com) in reserve in case of a look-alike complaint.

## 3. Airwallex setup (HK entity)

1. Airwallex dashboard → Developer → API keys → create a key with Payment Acceptance scope. Put `AIRWALLEX_CLIENT_ID` / `AIRWALLEX_API_KEY` in Vercel. Start with `AIRWALLEX_ENV=demo` and demo keys.
2. Developer → Webhooks → add `https://<domain>/api/webhooks/airwallex` for `payment_intent.succeeded`, `payment_intent.cancelled`, `refund.succeeded`. Copy the secret to `AIRWALLEX_WEBHOOK_SECRET`.
3. Payment Acceptance → Settings → statement descriptor: your brand + "ASSIST". Never "Indonesia Immigration".
4. Enable 3D Secure "always" for the first 3 months; relax to risk-based later.
5. Tell Airwallex compliance in writing what you sell (travel-assistance service, government form is free, disclosure on site) and attach the disclosure page URL. This pre-empts an RFI freeze.
6. Test in demo, then switch to `AIRWALLEX_ENV=prod` with production keys.

## 4. Supabase

1. Create the project (Singapore). SQL editor → run `supabase/schema.sql` (creates tables and the private `documents` bucket for e-VOA uploads).
2. Enable the `pg_cron` extension and run the commented purge job in the same file.
3. Project settings → API → copy URL and **service_role** key into Vercel. The service key is only ever used in server code.

## 5. Ops

1. Set `ADMIN_USER`/`ADMIN_PASSWORD` (long random). Console at `/admin`. Put it behind Cloudflare Access (free for up to 50 users) for a second factor.
2. Load `extension/` as an unpacked Chrome extension on each ops laptop (chrome://extensions → Developer mode → Load unpacked). Open an order, click "Copy order JSON", open the official portal, click the extension → Fill. The selectors in `extension/content.js` must be adjusted once against the live official form.
3. SLA: process only inside the 72-hour window before arrival; the console shows hours-to-arrival in green when the window is open.

## 6. Google Ads: what is and is not possible

- From **5 Oct 2026** Google enforces its updated "Government documents and official services" policy: ads for arrival cards, ETAs and eVisas are allowed only for government bodies and providers **explicitly authorized** by the issuing authority, proven by a link from an official government website to your domain.
- Without that authorization the ads will be disapproved and repeated attempts risk account suspension. Do not open a Google Ads account for arrival-card keywords until you hold the authorization.
- What works with Google today: organic SEO (this site is built for it: HowTo/FAQ schema, static pages, sitemap) and a Google Business Profile for the HK company.
- Paid channels that work today: Meta (Facebook/Instagram) and TikTok with "travel to Bali/Indonesia" interest targeting and the disclosure in the ad copy; Microsoft Ads (verify its policy first); partnerships with villas, hotels, dive centres, tour operators and travel bloggers paid per order via a `?ref=` code.
- Parallel track: write to Direktorat Jenderal Imigrasi requesting the criteria for authorized third-party providers. Only that unlocks Google Ads. Keep the request and reply on file for Google's certification form.

## 7. Before going live

- [ ] Replace the placeholders in `.env` (company name, support email). Address and registration number are intentionally not shown on the site (owner decision, 2026-09-23); EU/UK distance-selling rules expect them, revisit with counsel.
- [ ] HK solicitor review of `/legal/terms` and `/legal/privacy` (drafted, not reviewed).
- [ ] Indonesian counsel memo on ITE and PDP exposure.
- [ ] Trustpilot business profile; review invitation after delivery.
- [x] New-order email alert to ops and order confirmation to the customer (Resend). Set `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender domain in Resend), `OPS_EMAIL`.
- [ ] QR / e-VOA delivery email to the customer is still sent manually by ops from the console.
- [ ] Optional Google Sheet mirror of all orders: create a Google Cloud service account with the Sheets API enabled, download its JSON key, share the sheet with the service account email as Editor, set `GOOGLE_SHEET_ID` (from the sheet URL) and `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole JSON on one line).
- [x] Mobile navigation menu.
- [ ] Passport photo OCR (MRZ): planned, not implemented; the form is manual entry today.
- [ ] Translations (ZH, KO, JA, DE, FR, RU): planned; the site is English-only today.
- [ ] e-VOA: company card on the official e-visa portal for paying the IDR 500,000 government fee. The site shows it as USD 31 per traveler; check the IDR/USD rate monthly and adjust `PRICING.evoa.governmentFee` if it drifts more than 5%.
- [ ] e-VOA: verify the eligible-nationality list in `lib/evoa.ts` against the official list before launch.
