# Reviews: Trustpilot and Google review requests

Two days after a customer's arrival, the CRM emails a short "How was your arrival in Indonesia?" message
with a button for Trustpilot and one for Google. Both links come from environment variables; a link that
is not configured is left out, and if neither is configured nothing is sent.

## 1. Trustpilot business profile (free plan)

1. Go to https://business.trustpilot.com and create a free business account with the support mailbox.
   Company: Bulan Juli Limited. Website: `allindonesia-arrivalcard.com`.
2. Claim the domain: Trustpilot sends a verification email to an address at the domain (or asks for a DNS
   TXT record). Use the support@ mailbox on the domain, or add the TXT record at Cloudflare.
3. Fill in the profile: name "Arrival Card Assist", category "Travel agency" (or "Visa services" if it is
   offered for a private company), the Hong Kong address and the support email. Keep the description honest:
   private assistance service, not affiliated with the Indonesian government.
4. The review link is fixed by the domain, no dashboard step needed:
   `https://www.trustpilot.com/evaluate/allindonesia-arrivalcard.com`
   Put it in Vercel as `TRUSTPILOT_REVIEW_URL` (Production) and redeploy.
5. Free plan: reviews and replies are unlimited; the invitation emails, widgets and analytics are paid,
   which is why the CRM sends its own request email.

## 2. Google Business Profile for Bulan Juli Limited

1. Sign in at https://business.google.com with the company Google account and choose "Add your business".
2. Business name: **Bulan Juli Limited** (the legal name; the trade name can be added later as "Arrival Card
   Assist" only if Google accepts it). Business type: **service-area business** (customers are served online,
   the address is not a storefront). Do not show the address publicly; set the service area to the countries
   you sell to.
3. Category: do **not** choose "Visa and passport office" or any government-sounding category: Google
   removes private services listed that way. Pick **Travel agency** or **Business to business service**.
4. Address (used for verification only): Unit 909, Prosperity Millennia Plaza, 663 King's Road, Quarry Bay,
   Hong Kong. Website: `https://allindonesia-arrivalcard.com`. Phone: the support number.
5. Verification: Google offers video verification (a live recording showing the office door/sign, business
   mail and equipment) or a postcard with a code sent to the address (about 2 weeks). Video is faster;
   have the company registration document at hand. The profile only shows once verification is complete.

## 3. Google review link

1. Open the profile (search your business name while signed in, or go to https://business.google.com).
2. Click **Ask for reviews** (also under "Get more reviews" in the profile menu) and copy the short link,
   usually `https://g.page/r/<id>/review`.
3. Put it in Vercel as `GOOGLE_REVIEW_URL` (Production) and redeploy. Leave it empty until the profile is
   verified; the email simply shows the Trustpilot button alone until then.

## 4. How the automatic request works

- Cron: `GET /api/reviews/request` runs daily at **03:00 UTC** (`vercel.json`), authenticated with
  `CRON_SECRET` as the bearer token.
- It looks at orders with status `delivered` that have no `reviewRequestedAt` yet, and emails the customer
  **once per order**, when the arrival date is **between 2 and 14 days ago** (arrival date at 00:00 Jakarta).
- Orders whose arrival is more than 14 days ago are marked `reviewSkipped` and are never emailed, so nobody
  gets a late request.
- Nothing is sent or marked while `RESEND_API_KEY`/`EMAIL_FROM` are missing or while neither review URL
  is set. The order page in the ops console shows "review requested <date>" once the email went out.
- Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" https://allindonesia-arrivalcard.com/api/reviews/request`
  returns `{ candidates, sent, skipped, emailConfigured, reviewLinks, errors }`.
