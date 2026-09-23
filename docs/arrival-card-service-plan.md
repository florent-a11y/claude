# Indonesia Arrival Card Assistance Service — Plan, Legal Position, Budget

Date: 2026-09-23. Prepared for the Hong Kong entity (Airwallex account already open).

## 1. What the market actually is

- The All Indonesia arrival card (allindonesia.imigrasi.go.id) is **free**, mandatory since 1 Sept 2025,
  must be submitted within 72 h of arrival, and the QR code is emailed to the traveler.
- Paid third-party sites (indonesia-portal.com, indonesia-arrival.com run by Ringdo B.V., NL) charge
  USD 20–160. Travel guides (bali.com, Trip.com, Smartraveller, Welcome Back to Bali) explicitly call
  them scams. Trustpilot reviews of indonesia-arrival.com show the main complaints: hidden fees at
  checkout, price shown only after data entry, "priority" upsells, chargebacks.
- Ditjen Imigrasi has publicly warned against sites that use its name, logo or look-alike design.

Conclusion: a "copy that ranks above them" competes for a segment that Google, banks and the
Indonesian government are all actively squeezing. The only version of this business that survives
2027 is an **openly-disclosed assistance service** with a real value-add, not a look-alike.

## 2. Three hard constraints (read before spending money)

### 2.1 Google Ads is closing on 5 October 2026
Google's "Government documents and official services" policy already covers eVisas, ETAs and
entry/arrival forms. From **5 Oct 2026** only government entities or providers **explicitly
authorized by the issuing authority** may advertise, and the proof required is that the
advertiser's domain is **linked from an official government website** as an authorized provider.
Ditjen Imigrasi does not link any arrival-card provider. Therefore:
- Plan on **zero Google Ads for the arrival card** unless you obtain written authorization from
  Ditjen Imigrasi (a real but slow path; VFS holds this for eVOA, so partners do exist).
- Growth channels that remain: SEO, Meta/TikTok ads (their policies are looser but check), hotel
  and villa partnerships, tour operators, airline-adjacent affiliates, Bing (similar policy, verify).

### 2.2 Payments: Airwallex classifies travel arrangement services as "restricted"
Restricted = extra KYB, approval not guaranteed, and termination if disputes climb. The competitor
review pattern (hidden fees, "I thought it was the official site") is precisely what generates
chargebacks. Protect the Airwallex account by design:
- Price on the first screen, before any personal data is entered. No post-entry upsells.
- One-line disclosure above the fold and on the checkout page (wording in §5).
- Airwallex Hosted Payment Page or Payment Links with 3DS on. Never touch card numbers.
- Descriptor on the card statement = your brand + "assistance", not "Indonesia immigration".
- Refund automatically if the card is not delivered ≥ 6 h before arrival. A generous refund policy
  is cheaper than a dispute ratio above 0.75 %.
- Disclose this business line to Airwallex compliance before going live (RFI later is worse).

### 2.3 Automated submission to the government site
- Indonesia's ITE Law (UU 11/2008 as amended) criminalizes unauthorized access to electronic
  systems and the portal will simply block or captcha bulk traffic. A headless bot submitting on
  behalf of thousands of travelers is the highest-risk component of the whole project.
- PDP Law (UU 27/2022, fully in force since Oct 2024) applies to you as a foreign controller
  processing passport data of people entering Indonesia: lawful basis, privacy notice, retention
  limits, breach notification, cross-border safeguards.

Recommended architecture: **human-in-the-loop by default, with an autofill assistant** (browser
extension for your team) rather than a headless bot. Details in §4.

## 3. Product: what "better than indonesia-portal.com" means

1. **Transparent price on the landing page** and in the ad copy. Family/group pricing.
2. **Guided, multilingual form** (EN, ZH-CN, ZH-TW, KO, JA, DE, FR, RU, HI, AR) with inline validation
   (passport OCR/MRZ read via phone camera, flight number lookup for date/airport autofill).
3. **Deliverables**: the QR PDF, a printed-style wallet card, a WhatsApp/SMS copy, calendar reminder
   for the 72 h window, and a "what happens at the airport" one-pager.
4. **Bundles that are actually useful**: eVOA guidance, customs allowance calculator (alcohol,
   tobacco, cash > IDR 100 M, IMEI registration for phones), health/vaccination info, SIM/eSIM.
5. **Official news feed**: summaries (not verbatim copies) of imigrasi.go.id/berita and
   beacukai.go.id announcements, each linked to the source, updated weekly. Positions you as a
   knowledgeable service, and it is the SEO engine.
6. **Support**: live chat/WhatsApp in the traveler's language, 07:00–23:00 Jakarta time.
7. **Free tier**: a genuinely free step-by-step guide with a direct link to the official portal.
   This is what makes the "we are an assistance service" claim credible to regulators, Google and
   the card schemes.

## 4. Technical build

Yes, build it with Claude Code. Stack (all can be generated and maintained from this repo):

| Layer | Choice | Why |
|---|---|---|
| Site | Next.js 15 (App Router) + Tailwind, i18n routing | SEO-friendly SSR, easy multilingual |
| Hosting | Cloudflare Pages + Workers (or Vercel behind Cloudflare) | DDoS/WAF, bot fight mode, cheap, HK-neutral |
| DB / auth | Supabase (Postgres, RLS) in Singapore region | Close to Indonesia, EU-grade controls |
| Payments | Airwallex Hosted Payment Page + webhooks | Already have the account; no PCI scope |
| Email/SMS | Resend + Twilio (WhatsApp Business API) | Delivery of QR + reminders |
| Ops console | Internal Next.js admin (queue, SLA timers, copy-to-clipboard fields) | Team processes orders |
| Autofill | Chrome extension that fills the official form from the order record | Human clicks Submit; no bot |
| AI | Claude API for: passport MRZ extraction, translation, support chat, news summaries | |
| News | Scheduled Worker: fetch RSS/HTML of imigrasi + bea cukai news → Claude summary → review → publish | |

Automation policy:
- Phase 1 (launch): team member + autofill extension. Target < 10 min per order.
- Phase 2: a supervised browser agent (Playwright + Claude) on a dedicated residential/HK IP that
  fills the form and **pauses for a human to review and click Submit**. Never run unattended, never
  bypass captcha, respect the portal's terms.
- The traveler's own email goes in the official form so the QR reaches them directly; you retrieve
  a copy for delivery through the portal's "retrieve arrival card" page.

Data protection:
- Retain passport data 30 days after arrival, then hard-delete. Encrypt at rest (Supabase + pgsodium).
- Privacy notice covering PDP Law + GDPR (many customers are EU). Data-processing addendum with
  every vendor. Breach notification procedure (3×24 h under PDP Law).

## 5. Legal positioning and protection

- Operating entity: the HK Ltd. Show its name, HK address and registration number in the footer,
  T&Cs, privacy policy and receipts.
- Mandatory disclosure (top of every page and on checkout):
  "We are a private travel-assistance company, not affiliated with, endorsed by or acting for the
  Government of Indonesia or the Directorate General of Immigration. Our fee is for form
  preparation, verification and support."
  (Owner's decision on 2026-09-23: the site does not state that the official form is free. Note
  that UK CMA, EU UCPD and US FTC enforcement against visa/ETA assistance sites has centred on
  exactly that omission; revisit with counsel before scaling paid acquisition.)
- Never use: Garuda emblem, Imigrasi/Bea Cukai logos, "official", ".go.id" look-alike colours,
  the words "imigrasi", "govt", "official" in the domain. This is what turns a legal service into
  passing-off/fraud exposure and gets domains blocked by Komdigi.
- Original design and original copy only. Copying indonesia-portal.com's text, images or layout
  is copyright infringement and would look identical to the sites being blacklisted.
- T&Cs: service fee, non-refundable government-side outcomes, refund guarantee terms, governing
  law Hong Kong. Have a HK lawyer review (USD 1.5–3 k) and get a short Indonesian-counsel memo on
  ITE/PDP exposure (USD 1–2 k).
- Ask Ditjen Imigrasi in writing about a partner/authorization scheme. Even a "no" on file helps.

## 6. Domain and SEO

Do not target the government's own brand ("all indonesia"). Target intent keywords:
"indonesia arrival card", "bali arrival card", "indonesia customs declaration", "e-cd indonesia",
"arrival card indonesia how to fill", plus translations (e.g. "인도네시아 입국카드", "印尼入境卡",
"Einreisekarte Indonesien", "carte d'arrivée Indonésie").

Domain candidates (availability not verified from this environment; check at a registrar):
1. indonesiaarrivalcard.com / indonesia-arrivalcard.com  (exact-match, honest)
2. arrivalcard.id — .id is open to foreigners but requires an Indonesian contact; skip for now
3. baliarrivalcard.com — Bali is the highest-intent traffic; can be a second site
4. entryindonesia.com / indonesiaentry.com — brandable, room to add eVOA later

Recommendation: buy #1 (or the closest available) as the main site and #3 as a landing brand
that redirects. Avoid anything containing "portal", "imigrasi", "official", "gov".

SEO plan: 40–60 pages in month 1 (per-nationality guides, per-airport guides, customs rules,
FAQ), weekly news summaries, schema.org FAQ/HowTo markup, Core Web Vitals green, backlinks from
hotels/villas/tour operators you partner with, Trustpilot from day one.

## 7. Pricing

Competitors: USD 20–160 with opaque add-ons. Recommendation: one transparent price, shown first.

| Product | Price (USD) | Notes |
|---|---|---|
| Arrival card assistance, 1 traveler | 24.90 | delivered < 12 h, 24/7 support |
| Each additional traveler in the same booking | 14.90 | families/groups |
| Express (< 2 h, human-verified) | +15.00 | the only add-on, shown upfront |
| eVOA assistance (later phase) | 39.90 + government fee shown separately | |
| Free guide | 0 | direct link to official portal |

Card fees: Airwallex ~3.3 % + fixed fee on international cards; net ~USD 23 on a USD 24.90 order.
Target ops cost per order < USD 2 (10 min at Indonesia wages). Gross margin ~ 85 %.

## 8. Budget

One-off (USD):
| Item | Low | High |
|---|---|---|
| Domains (2–3, incl. defensive) | 60 | 200 |
| Design system + build via Claude Code (your time; contractor if outsourced) | 0 | 4,000 |
| Legal (HK T&Cs/privacy + Indonesian ITE/PDP memo) | 2,500 | 5,000 |
| Initial SEO content (40–60 pages, 8 languages, human-reviewed) | 1,500 | 4,000 |
| Trustpilot/branding/photography | 0 | 800 |
| **Total** | **~4,000** | **~14,000** |

Monthly (USD):
| Item | Low | High |
|---|---|---|
| Cloudflare + Vercel/Workers | 0 | 60 |
| Supabase, Resend, Twilio/WhatsApp | 50 | 200 |
| Claude API (OCR, chat, translation, news) | 50 | 300 |
| Ops team (1–2 people, Indonesia-based, shifts) | 800 | 1,800 |
| Content/SEO upkeep | 300 | 1,000 |
| Meta/TikTok ads test (Google Ads not available, see §2.1) | 1,000 | 5,000 |
| Airwallex fees | 3.3 % of revenue | |
| **Total** | **~2,200** | **~8,400** |

Break-even at ~USD 24 net/order: roughly 100–350 orders/month.

## 9. Sequence

1. Week 1: entity/legal check, Airwallex disclosure, domains, this repo scaffolded with Claude Code.
2. Weeks 2–3: site + checkout + ops console + autofill extension; privacy/T&Cs live; free guide live.
3. Week 4: soft launch, 20 orders processed manually, measure time/order and dispute rate.
4. Month 2: SEO content in 8 languages, news feed live, hotel/villa partnership outreach.
5. Month 3: supervised browser agent pilot; eVOA assistance; Meta ads test.
6. In parallel: written request to Ditjen Imigrasi regarding authorized-provider status. This is the
   only key that reopens Google Ads.

## Sources
- Google policy change: https://www.techwyse.com/news/platform-updates/google-ads-government-documents-services-policy-update-october-2026 ,
  https://visasnews.com/en/google-tightens-advertising-rules-for-visas-and-etas/ ,
  https://support.google.com/adspolicy/answer/13156083
- Airwallex unsupported/restricted industries: https://help.airwallex.com/hc/en-gb/articles/4410623274905-Unsupported-Industries
- Official portal and warnings: https://allindonesia.imigrasi.go.id/ , https://news.detik.com/berita/d-8511131/waspada-penipuan-layanan-keimigrasian-hati-hati-website-palsu
- Travel-guide scam warnings: https://bali.com/bali/all-indonesia/ , https://www.welcomebacktobali.com/blog/latest-updates/the-new-all-indonesia-arrival-card
- Competitor: https://www.trustpilot.com/review/indonesia-arrival.com , https://indonesia-arrival.com/terms.pdf
- PDP Law: https://www.dlapiperdataprotection.com/?t=law&c=ID
