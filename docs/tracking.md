# Conversion tracking (GA4, Google Ads, Meta)

Nothing loads until the environment variables in the "Tracking" section of `.env.example` are set. With them set, the
site runs GA4 (gtag.js) and the Meta pixel in the browser, and sends the paid conversion again from the server so it
is counted even when the customer closes the tab before the success page loads.

## What fires where

| Event | Browser (GA4 / Meta) | Server | Dedup key |
|---|---|---|---|
| Page view | `page_view` / `PageView` on load and on every client-side navigation (`components/Analytics.tsx`) | – | – |
| Reached the "Contact & pay" step | `begin_checkout` / `InitiateCheckout`, once per form (`app/apply/ApplyForm.tsx`) | – | – |
| Reminder saved | `generate_lead` / `Lead` on the success path of `components/ReminderForm.tsx` | – | – |
| Order paid | `purchase` / `Purchase` on `/apply/success` (`components/PurchaseTracker.tsx`) | GA4 Measurement Protocol `purchase` + Meta Conversions API `Purchase`, sent from the Airwallex webhook right after the order becomes paid (and from the dev-mode path of `POST /api/orders`) – `lib/tracking.ts` | GA4: `transaction_id` = order id (plus the same `client_id` when the `_ga` cookie was captured). Meta: `event_id` = `purchase-<order id>` on both sides |

Value is the order total in USD (`amountCents / 100`, government fee included), currency `USD`, one item per order
with `item_id` = product (`arrival_card`, `evoa`, `bundle`), `quantity` = number of travelers and `price` = total ÷
travelers.

The server-side event is the source of truth. It never throws, and it is idempotent: it is skipped when
`order.trackingSentAt` is already set, and that timestamp is written after the attempts **whether they succeeded or
not**, so a webhook retry or a redeploy cannot turn a transient GA4/Meta outage into a burst of duplicate revenue.
Failures are logged with the `[tracking]` prefix; a missed conversion is cheaper than a double-counted one.

## Attribution data

`lib/analytics-client.ts` → `getAttribution()` is sent with every order and reminder:

- `_ga` cookie (GA4 client id), `_fbp`, `_fbc` cookies
- `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid` from the URL, persisted as first touch in
  `localStorage` for 30 days (a direct visit followed by an ad click keeps the ad click)
- landing page, user agent

The server adds `ip` (first value of `x-forwarded-for`) and `userAgent` from the request headers. Everything is stored
under `order.attribution` / `reminder.attribution` (max 200 characters per field) and used only to build the server
events. On Supabase the reminders table needs the new `attribution jsonb` column
(`alter table public.reminders add column if not exists attribution jsonb;`); orders keep it inside `payload`.

## Verifying

**GA4 DebugView** (Admin → DebugView): open the site with the Google Analytics Debugger extension, or append
`?_dbg=1` after adding `debug_mode: true` to the config temporarily. Browser events show under your device. To see the
server-side purchase there, add `"debug_mode": true` to the event `params` in `lib/tracking.ts` for the test, or POST the
same payload to `https://www.google-analytics.com/debug/mp/collect?...` (validation endpoint; returns
`validationMessages`, an empty array means the payload is well-formed). Place a dev-mode order (no Airwallex keys) and
look for `purchase` with your order id as `transaction_id`. Reports outside DebugView lag by 24–48 h.

**Meta Test Events** (Events Manager → your pixel → Test events): set `META_CAPI_TEST_EVENT_CODE` to the `TESTxxxxx`
code shown there and restart the server; server events appear in the tab within seconds with "Server" as the source.
Browser events appear when you open the site from the same tab's "Test browser events" box. A paid order should show one
`Purchase` from the browser and one from the server, marked as deduplicated (same event id). Clear the test code before
going live, otherwise production events stay in the test tab and never reach reporting.

**Google Ads**: do not add a separate Ads conversion tag. Link the GA4 property to the Ads account (GA4 Admin → Product
links → Google Ads links), mark `purchase` as a key event (Admin → Key events), then in Google Ads go to Goals →
Conversions → New conversion action → Import → Google Analytics 4 properties → Web → select `purchase`. Count "one",
value "use the value from GA4", attribution "data-driven". Optionally import `generate_lead` as a secondary action. The
`gclid` captured on the landing page is passed with the server event so imported conversions keep their click
attribution.

## Privacy

Only hashed identifiers leave the server: email, phone, first and last name and nationality are SHA-256 hashed before
being sent to Meta (`lib/tracking.ts`); the IP address and user agent are passed in clear, as Meta requires for
matching. Nothing about the passport or the declarations is sent to either platform. GA4 is configured with
`anonymize_ip`.

Before enabling the pixels in production, add this sentence to the privacy policy (`app/legal/privacy`), under the
cookies / analytics section – not done by this change:

> We use Google Analytics 4 and the Meta (Facebook) Pixel, including their server-side interfaces (Google Analytics
> Measurement Protocol and Meta Conversions API), to measure visits and advertising conversions; for a completed order
> we send Google and Meta the order value and a hashed (irreversible) version of your email address, phone number,
> name and nationality together with your IP address, browser identifier and advertising click identifiers, so that
> the advertising platforms can attribute the purchase to an ad, and you can opt out through the settings of those
> platforms or by using a browser that blocks their scripts.

If the site later serves EU/UK visitors with a consent banner, gate `components/Analytics.tsx` on consent and forward the
consent state with `gtag('consent', ...)`; the server-side events should then only be sent for orders whose
`attribution` carries a consent flag.
