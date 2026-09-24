# Google Ads launch package: Arrival Card Assist

Date: 2026-09-24. Site: https://allindonesia-arrivalcard.com (brand "Arrival Card Assist", operator Bulan Juli Limited, Hong Kong).
Companion files: `docs/google-ads-keywords.csv` (campaigns, ad groups, keywords, negatives) and `docs/google-ads-rsa.csv`
(63 responsive search ads in 8 languages). Both are in Google Ads Editor CSV import format (UTF-8 with BOM).

Note on sources: the policy pages on support.google.com, transparency.meta.com, ads.tiktok.com and about.ads.microsoft.com
could not be opened from this environment (network egress blocked). Their content was verified through Google's own search
snippets and through dated secondary reports quoting them. Every claim below carries its source. Re-read the four primary
pages once before the first spend; they change without notice.

---

## 0. Summary

- Today (24 Sep 2026) ads that promote getting an Indonesia arrival card or e-VOA are a restricted category. They need Google's
  "Government documents and services" certification. From 5 Oct 2026 that certification is granted only to providers whose
  domain is linked as authorized from an official government website. Ditjen Imigrasi links no such provider. The
  application takes 10–12 business days, so any application filed now is decided under the new rule.
- Conclusion: **the /apply and /evoa campaigns cannot run on Google unless Ditjen Imigrasi authorizes the company in writing
  and publishes a link.** This document ships them anyway, paused and labelled `mode-A-authorized-only`, so they are ready the
  day authorization arrives.
- What can run now: informational campaigns for /guide, /reminder and /customs (labelled `mode-B-informational`), written
  without acquisition claims. This is lower risk, not zero risk: Google reviews the destination domain, which sells the service.
  Expect some disapprovals; appeal once, never re-submit the same ad repeatedly.
- Meta (Facebook/Instagram) has no government-documents certification. Its rules for this category are the general ones
  (no implied affiliation, no misleading claims, no passport numbers in lead forms). TikTok bans immigration-law services and
  needs 18+ targeting for legal-adjacent services. Microsoft Advertising copied Google's authorization rule on 19 Aug 2026.
- Before any spend, three site changes: (1) put the "free on the official portal" sentence with a link on /apply, /reminder,
  /pricing, /evoa and /customs (today it is only on the home page, /guide and the legal pages); (2) add a consent banner with
  Google Consent Mode v2 before targeting the EEA, the UK or Switzerland; (3) remove the "Template for legal review before
  launch" line from /legal/privacy and /legal/terms. See section 6.

---

## 1. Policy

### 1.1 Google Ads: what the rule is today and after 5 October 2026

Current policy ("Other restricted businesses: Government documents and services", support.google.com/adspolicy/answer/13156083):

- Scope: documents and services obtainable directly from a government, including visas, eVisas, electronic travel
  authorizations and entry/arrival forms. Trade press explicitly lists "Vietnam arrival card", "UK ETA", "official ESTA"
  style keywords as in scope (VisasNews, 2026).
- Only government entities and certified providers may run ads for these. A non-government provider has to apply for the
  certification. The landing page must clearly disclose that the advertiser is a private entity not affiliated with any
  government, disclose the fee, state that the document is available for free or cheaper from the government, and link to the
  official source (Brightery guide; Google Ads Community threads 247062722 and 391402543).
- Since October 2025 Google adds an automatic "Not a government website" label to Search ads from non-government advertisers
  in this category (Kliken Help Center, "Google Ads Policy Update: Government Documents and Services Disclosure (October
  2025)"). Our ads will carry that label. Our copy says the same thing, so it is consistent.

Update announced August 2026, enforced from 5 October 2026 (support.google.com/adspolicy/answer/17260489; Search Engine
Roundtable, Aug 2026; Search Engine Land, Aug 2026; PPC News Feed, Aug 2026):

- Only governments and **authorized providers** may run ads that "promote direct acquisition" of a government document or
  service.
- Authorized provider = an advertiser that has been given explicit permission by the government to provide that specific
  document or service. Proof: **the advertiser's domain must be linked from an official, publicly accessible government website
  and be explicitly referenced there as authorized** for that document or service.
- Qualifies: a government-managed directory of approved partners, an official regulatory portal listing the provider.
  Does not qualify: business licences, commercial contracts, company registrations, government-hosted blog posts.
- Existing certifications built on commercial relationships rather than a public authorization are expected to lapse.
  Google can deny or revoke certification at any time.
- Timelines quoted by Google: advertiser verification 5–7 business days; certification decision 10–12 business days
  (TechWyse, Aug 2026). Filing in late September lands the decision after 5 October.

What this means for allindonesia-arrivalcard.com:

| Ad | Landing page | Before 5 Oct 2026 | From 5 Oct 2026 |
|---|---|---|---|
| "We prepare your arrival card, from $24.90" | /apply | Needs certification (not held) | Only with Ditjen Imigrasi authorization link |
| "e-VOA assistance $70.90" | /evoa | Needs certification (not held) | Only with authorization link |
| "Free guide: how the arrival card works" | /guide | Grey area, see below | Grey area, see below |
| "Free reminder when your 72-hour window opens" | /reminder | Grey area | Grey area |
| "Customs allowances explained" | /customs | Not a government document ad; allowed | Allowed |

The grey area: the update text limits the new rule to ads that "promote direct acquisition". An ad for a free guide does not.
But Google reviews the whole destination, and the guide and reminder pages both carry a paid call to action. Practical
position: run informational ads, keep the copy free of acquisition claims, keep prices out of the informational ads, and
accept that a reviewer may still apply the label or disapprove. One appeal per disapproved ad, with the argument that the ad
and page are informational. Never open a second account or a second domain to get around a disapproval; that is
"Circumventing systems" and ends the account.

Related rules that still apply to every ad on this site:

- Misrepresentation: no "official", no government names as if they were ours, no emblems, no ".go.id" colours. "All
  Indonesia" may be used descriptively in a description ("the All Indonesia arrival card"), never in a headline as a brand.
  The domain itself contains "allindonesia". See section 6 for the risk.
- Advertiser identity verification is mandatory for this category. Have the HK Certificate of Incorporation, Business
  Registration (76938968-000) and a document showing the registered address ready.
- Consent Mode v2 is required for EEA and UK traffic since March 2024 (support.google.com/google-ads/answer/13695607).

### 1.2 How to apply for Google's certification (do it now, even if refused)

1. Google Ads > Admin > Advertiser verification. Complete "About your business" and "Business operations" verification
   with the HK company documents. Wait for the confirmation email (5–7 business days).
2. Open the policy page support.google.com/adspolicy/answer/13156083 and click the "apply for certification" link under
   "Government documents and services". The form is a Google support form (title "Government documents and services
   certification"). Fill it per Google Ads customer ID.
3. Fields the form asks for (from the Ads Community threads): customer ID, country/countries of targeting, the domain,
   the government document(s) covered (Indonesia arrival card; Indonesia e-VOA), and **the URL of the government page that
   lists the domain as an authorized provider**. Until Ditjen Imigrasi publishes that page, leave the field with the letter
   reference (section 1.3) and expect a refusal. A refusal on file is useful: it proves good faith to Airwallex, to the card
   schemes and in any later appeal.
4. Decision by email in 10–12 business days. The certificate is attached to the account, not to a campaign.
5. Re-apply only when the authorization link exists. Repeated applications with the same evidence are ignored.

Evidence checklist for a successful application (what "authorized provider" looks like in practice):

- A page on imigrasi.go.id, kemenimipas.go.id or allindonesia.imigrasi.go.id that names Bulan Juli Limited / Arrival Card
  Assist and links to allindonesia-arrivalcard.com as an approved assistance provider.
- Or a listing in a government-run directory of partners (the way VFS Global is listed for visa services).
- Not enough: a letter from Imigrasi, a contract, the HK company registry, a news article, a blog post on a regional
  immigration office site.

### 1.3 Requesting authorization from Ditjen Imigrasi

Who and where (imigrasi.go.id/ppid-page/kontak-eppid; kemenimipas.go.id contact page; verified September 2026):

- Direktur Jenderal Imigrasi, Kementerian Imigrasi dan Pemasyarakatan RI. Director General since 1 April 2026: Hendarsam
  Marantoko (bengkulu.imigrasi.go.id, April 2026). Check the name on imigrasi.go.id/pejabat before sending.
- Address: Gedung Direktorat Jenderal Imigrasi, Jl. H.R. Rasuna Said Kav. X-6, Kuningan, Jakarta Selatan 12940.
- Email: humas@imigrasi.go.id (public relations). Also file the same text as a formal public-information request through
  ePPID (imigrasi.go.id/ppid-page/kontak-eppid). Under Law 14/2008 on Public Information (KIP) the PPID must answer a written
  request within 10 working days, extendable once by 7. That is the only channel with a legal response deadline.
- Send: courier with signed original, email PDF to humas@, ePPID form. Keep the courier receipt and the ePPID ticket number.

Expected outcomes and next step for each:

- "No scheme exists; the arrival card is free and must be filed by the traveler": file the reply with the Google refusal.
  Stay in mode B. Revisit in 6 months.
- "Submit a proposal": ask for the criteria in writing, then offer the terms already on the site (disclosure, price first,
  no logos, PDP compliance, human-in-the-loop, 30-day deletion).
- "Authorized, with conditions": ask for the public listing URL. That URL is the Google evidence.

#### Draft letter (English)

> Bulan Juli Limited
> Unit 909, Prosperity Millennia Plaza, 663 King's Road, Quarry Bay, Hong Kong
> Company Registration No. 76938968 · info@allindonesia-arrivalcard.com
>
> Hong Kong, [date]
>
> To: Director General of Immigration
> Directorate General of Immigration, Ministry of Immigration and Corrections of the Republic of Indonesia
> Jl. H.R. Rasuna Said Kav. X-6, Kuningan, Jakarta Selatan 12940
> Cc: Public Relations (humas@imigrasi.go.id); PPID Ditjen Imigrasi
>
> Subject: Request for information on the authorization of third-party assistance providers for the All Indonesia arrival card
>
> Dear Director General,
>
> Bulan Juli Limited is a Hong Kong company operating "Arrival Card Assist" (allindonesia-arrivalcard.com), a private
> assistance service for travelers completing the All Indonesia arrival card and, where applicable, the e-VOA.
>
> We wish to state clearly how we operate. We are not affiliated with the Government of Indonesia and say so on every page.
> We tell every visitor that the arrival card is free of charge on allindonesia.imigrasi.go.id and link to it. Our fee is
> shown before any personal data is entered and covers guided data collection, manual verification by a trained person,
> submission on the traveler's behalf inside the 72-hour window, and support. We do not use automated or bulk submission, we
> do not use government emblems or names in our branding, and we delete passport data 30 days after arrival in line with
> Law 27/2022 on Personal Data Protection.
>
> Advertising platforms (Google, from 5 October 2026; Microsoft, from 19 August 2026) now allow advertising of assistance
> with government documents only by providers that the issuing authority lists publicly as authorized. We therefore
> respectfully request the following information:
>
> 1. Whether the Directorate General operates or plans a scheme for authorized third-party assistance providers for the
>    All Indonesia arrival card or the e-VOA, and the criteria and procedure to apply.
> 2. If no such scheme exists, written confirmation to that effect.
> 3. Any conditions the Directorate General would require of an assistance provider (disclosures, data handling, submission
>    method, reporting), which we undertake to meet.
>
> We are available to present our procedures in Jakarta or online at your convenience.
>
> Respectfully,
> [Name], Director, Bulan Juli Limited

#### Draft surat (Bahasa Indonesia)

> Bulan Juli Limited
> Unit 909, Prosperity Millennia Plaza, 663 King's Road, Quarry Bay, Hong Kong
> Nomor Registrasi Perusahaan 76938968 · info@allindonesia-arrivalcard.com
>
> Hong Kong, [tanggal]
>
> Kepada Yth. Direktur Jenderal Imigrasi
> Direktorat Jenderal Imigrasi, Kementerian Imigrasi dan Pemasyarakatan Republik Indonesia
> Jl. H.R. Rasuna Said Kav. X-6, Kuningan, Jakarta Selatan 12940
> Tembusan: Bagian Humas (humas@imigrasi.go.id); PPID Ditjen Imigrasi
>
> Perihal: Permohonan informasi mengenai otorisasi penyedia layanan bantuan pihak ketiga untuk kartu kedatangan All Indonesia
>
> Dengan hormat,
>
> Bulan Juli Limited adalah perusahaan yang berkedudukan di Hong Kong dan mengoperasikan "Arrival Card Assist"
> (allindonesia-arrivalcard.com), yaitu layanan bantuan swasta bagi wisatawan dalam mengisi kartu kedatangan All Indonesia
> dan, bila diperlukan, e-VOA.
>
> Kami ingin menyampaikan secara terbuka cara kami beroperasi. Kami tidak berafiliasi dengan Pemerintah Republik Indonesia
> dan menyatakannya di setiap halaman. Kami memberitahukan setiap pengunjung bahwa kartu kedatangan dapat diisi secara gratis
> di allindonesia.imigrasi.go.id dan mencantumkan tautannya. Biaya layanan kami ditampilkan sebelum data pribadi apa pun
> dimasukkan dan mencakup pengumpulan data terpandu, pemeriksaan manual oleh petugas terlatih, pengajuan atas nama pelanggan
> di dalam jendela 72 jam, serta dukungan. Kami tidak menggunakan pengajuan otomatis atau massal, tidak menggunakan lambang
> atau nama instansi pemerintah dalam merek kami, dan menghapus data paspor 30 hari setelah kedatangan sesuai UU 27/2022
> tentang Pelindungan Data Pribadi.
>
> Platform periklanan (Google mulai 5 Oktober 2026; Microsoft mulai 19 Agustus 2026) kini hanya mengizinkan iklan layanan
> bantuan dokumen pemerintah dari penyedia yang dicantumkan secara publik sebagai penyedia resmi oleh instansi penerbit.
> Oleh karena itu, dengan hormat kami memohon informasi sebagai berikut:
>
> 1. Apakah Direktorat Jenderal Imigrasi memiliki atau merencanakan skema penyedia layanan bantuan pihak ketiga yang
>    diotorisasi untuk kartu kedatangan All Indonesia atau e-VOA, beserta kriteria dan prosedur pengajuannya.
> 2. Apabila skema tersebut tidak ada, konfirmasi tertulis mengenai hal tersebut.
> 3. Persyaratan apa pun yang akan diminta Direktorat Jenderal dari penyedia layanan bantuan (pernyataan non-afiliasi,
>    pengelolaan data, metode pengajuan, pelaporan), yang kami sanggupi untuk dipenuhi.
>
> Kami bersedia memaparkan prosedur kami di Jakarta atau secara daring sesuai waktu yang Bapak/Ibu tentukan.
>
> Hormat kami,
> [Nama], Direktur, Bulan Juli Limited

### 1.4 The compliant fallback if refused

Google, mode B only:

- Run only the `*-Informational` campaigns (ad groups how-to-fill, app-problems, customs-declaration, transit). Landing
  pages /reminder, /guide, /customs. No price, no "we submit", no "get your card". Copy stresses "private assistance service",
  "not a government website", "free guide", "free reminder", "links to the official portal".
- Keep `*-Transactional` campaigns paused. Do not "test" one ad. A disapproval under this policy is recorded against the
  account, and three strikes suspend it.
- Conversion goal for these campaigns is `generate_lead` (reminder saved). Orders arrive later through the reminder email,
  which is direct/email traffic in Google's eyes but carries the stored first-touch `gclid` (section 5), so GA4 still credits
  the click.

Microsoft Advertising (Bing): same rule as Google since 19 Aug 2026. Third-party providers need pre-approval through the
"Government services advertising program" with proof of authorization in the target market; aggregators, affiliates and
lead-gen are prohibited; unauthorized providers must say they are unauthorized and separate the service fee from the
government fee (PPC News Feed, Aug 2026; about.ads.microsoft.com policy "Authorized third-party government services").
Treat as closed for /apply and /evoa. Informational ads are the same grey area as on Google, on a much smaller audience.
Skip Bing until Google mode B has data.

Meta (Facebook, Instagram), the main paid channel while Google is closed:

- No government-documents certification exists. The rules that bite are "Unacceptable Business Practices" and "Fraud,
  Scams and Deceptive Practices" (implied affiliation, fees for free services without disclosure, misleading claims),
  "Personal attributes", and the ban on asking for government identifiers such as passport numbers in Instant Forms
  (transparency.meta.com ad standards, 2026). Meta is extending advertiser verification to most spend by end 2026
  (Stackmatix, 2026); verify the business in Business Manager now.
- Compliant creative: primary text opens with "Private assistance service, not affiliated with any government website."
  Price in the creative for conversion campaigns. No emblems, no "official". Hook: "Flying to Indonesia in more than 3
  days? The arrival card can only be filed 72 h before landing. Get a free reminder."
- Structure: one campaign per language, Sales objective (Purchase) for /apply audiences already in the 72-hour window is
  impossible to target, so use Leads objective (Lead event = reminder) to /reminder, plus a small Sales campaign to /apply
  for retargeting site visitors from the last 7 days. Interests: Bali, Indonesia travel, Lombok, Komodo, Yogyakarta; travel
  intent; exclude Indonesia residents in the foreign-language campaigns. Placements: Advantage+ with Audience Network off.
- Budget for the fallback: €1,000/month Meta, €200/month TikTok test, remainder of the €3,000 to Google mode B.
- Tracking already exists: browser pixel + Conversions API with dedup (docs/tracking.md). Put the privacy paragraph live and
  gate the pixel on consent for EU visitors.

TikTok: "Ads for services related to immigration law are not allowed"; legal services only with 18+ targeting and no
consultation offers (ads.tiktok.com, "Other products and services"). Arrival card assistance is not legal advice, but a
reviewer may read it that way. Run 18+ only, creative built around the free guide and the 72-hour reminder, landing on
/reminder. Expect manual review; do not appeal more than once.

---

## 2. Account structure

Account settings (set once, cannot be changed later): currency EUR, time zone (GMT+08:00) Hong Kong. Auto-tagging on.
Enhanced conversions off until the GA4 user-provided data feature is wired (needs code). Link GA4 property, Search Console
and Merchant Center (not needed).

### 2.1 Campaigns

Sixteen Search campaigns: one Transactional and one Informational per market. Names in the CSV: `EN-Transactional`,
`EN-Informational`, ... `ID-Informational`. All imported **paused**. Enable per the launch plan.

| Market | Campaign languages | Locations (presence, not interest) | Excluded | Notes |
|---|---|---|---|---|
| EN | English | Australia, New Zealand, Singapore, Malaysia, Philippines, India, United States, Canada, United Kingdom, Ireland, Netherlands, South Africa, United Arab Emirates | Indonesia, China | UK, Ireland, Netherlands only after Consent Mode v2 is live |
| DE | German | Germany, Austria, Switzerland | – | All three need Consent Mode v2 (CH treated like EEA) |
| ZH | Chinese (traditional), Chinese (simplified) | Taiwan, Hong Kong, Macao | – | Google Ads does not serve in mainland China; ads are Traditional Chinese; the /zh page is Simplified (see 6). Add Singapore and Malaysia with a Simplified ad variant later |
| FR | French | France, Belgium, Switzerland, Luxembourg | – | Consent Mode v2 needed; add Canada (Quebec) in month 2 |
| ES | Spanish | Spain, Mexico, Argentina, Chile, Colombia, Peru | – | Spain needs Consent Mode v2; start with LatAm if the banner is late |
| JA | Japanese | Japan | – | |
| KO | Korean | South Korea | – | |
| ID | Indonesian | Indonesia | – | Returning citizens and residents; no e-VOA ad group |

Location option: "Presence: people in or regularly in your targeted locations" (not "interest"). Otherwise the EN campaign
soaks up Indonesian residents searching in English.

### 2.2 Budget: €3,000/month test

Split by expected search volume and value per order, daily = monthly ÷ 30.4. Transactional 60 % / Informational 40 % in
mode A. In mode B the Transactional line is paused and its money moves to the Informational campaign of the same market.

| Market | Monthly € | Daily T | Daily I | Expected CPC (search, mode A terms) | Expected CPC (informational terms) | Source basis |
|---|---|---|---|---|---|---|
| EN | 1,050 | 20.70 | 13.80 | $0.90–2.50 | $0.40–1.20 | Travel median CPC $2.12–2.17 (LocaliQ 2026; PPCChief 2026); visa-assistance terms sit below immigration-law terms ($15–40, Media Spearhead) because the buyer is a tourist, not a client |
| DE | 420 | 8.30 | 5.50 | €0.70–1.80 | €0.30–0.90 | DACH travel CPCs run 20–30 % under US (Statista travel CPC by country, 2024) |
| ZH (TW/HK/MO) | 300 | 5.90 | 3.90 | $0.50–1.50 | $0.25–0.70 | Lower competition; few paid "入境卡" advertisers |
| FR | 240 | 4.70 | 3.20 | €0.60–1.50 | €0.30–0.80 | |
| ES | 210 | 4.10 | 2.80 | €0.40–1.20 | €0.20–0.60 | LatAm CPCs lower than Spain |
| JA | 240 | 4.70 | 3.20 | ¥80–250 ($0.55–1.70) | ¥40–120 | |
| KO | 240 | 4.70 | 3.20 | ₩700–2,000 ($0.50–1.50) | ₩300–900 | |
| ID | 150 | 3.00 | 2.00 | Rp 800–3,000 ($0.05–0.20) | Rp 500–1,500 | Indonesian CPCs from Rp 800 (Lopokopi 2026; Celcius Digital 2026) |
| Reserve | 150 | – | – | | | Search-term harvesting, later Performance Max test |

These CPCs are estimates. No public dataset quotes "indonesia arrival card" bids. Verify in Keyword Planner before launch and
replace with week-1 actuals. The Max CPC caps in the CSV (EN 1.80/0.90, DE 1.40/0.70, ZH 1.00/0.50, FR 1.10/0.60,
ES 0.90/0.50, JA 1.20/0.60, KO 1.10/0.60, ID 0.15/0.08, in EUR) are ceilings for "Maximize clicks" during weeks 1–2.

### 2.3 Schedule, devices, bidding

- Ads run 24/7. The reason: a traveler files inside the 72 hours before landing, at any hour, often from an airport.
- Dayparting instead of "3 days before arrival" (which no signal supports): most cards are filed the evening before departure
  in the traveler's home time zone. Bid +15 % on the market's local 18:00–23:00, −30 % on local 01:00–06:00. For EN the
  "local evening" is the Asia-Pacific evening (AU, NZ, SG, MY, PH), which is also the hour when Indonesia-bound flights from
  Europe depart. Ad schedules are entered in the account time zone (GMT+8):

| Market | Local evening 18–23 | In account time (GMT+8) | Night −30 % (GMT+8) |
|---|---|---|---|
| EN (APAC weighted) | AEST/NZST/SGT | 16:00–23:00 | 03:00–08:00 |
| DE, FR, ES (Europe) | CET/CEST | 00:00–06:00 (next day) | 09:00–13:00 |
| ZH (TW/HK) | CST/HKT | 18:00–23:00 | 01:00–06:00 |
| JA, KO | JST/KST | 17:00–22:00 | 00:00–05:00 |
| ID | WIB | 19:00–24:00 | 02:00–07:00 |

- Devices: no adjustment for two weeks. Then expect mobile to convert on /reminder and desktop on /apply (passport photos
  and typing). Adjust ±20 % from the data, not from a guess.
- Bidding: "Maximize clicks" with the Max CPC ceiling for two weeks or until 15 conversions per campaign, then "Maximize
  conversions" with a target CPA (section 7). Informational campaigns optimize to `generate_lead`.
- Ad rotation: optimize. Ad Strength will show "Average" because Headline 1 and Description 1 are pinned. That is intended:
  the pinned description carries the disclosure, which policy requires to be visible.
- Search partners off. Display expansion off. Broad match off (all keywords are phrase or exact).
- Performance Max: not before month 2, and only for the Informational goal (lead) with brand exclusions for "imigrasi",
  "All Indonesia" and the competitor names. PMax cannot be kept away from acquisition intent; in mode B it is a policy risk.

---

## 3. Keywords (docs/google-ads-keywords.csv)

Import: Google Ads Editor > Account > Import > From file. The file creates 16 campaigns, 63 ad groups, keywords and
campaign-level negatives. Review the "Campaign" rows first (budget, status) and set locations, languages and schedules by
hand (Editor's CSV does not carry them reliably across accounts).

### 3.1 Ad groups and landing pages

| Ad group | Intent | Final URL (per locale prefix) | Why this page |
|---|---|---|---|
| arrival-card-generic | transactional | /apply | Price is on step 1; the form refuses payment outside the 72-hour window and captures a reminder instead |
| bali-arrival-card | transactional | /apply | Same, Bali is the highest-volume modifier |
| evoa | transactional | /evoa | Government fee itemised; no 72-hour gate |
| family-children | transactional | /apply | Multi-traveler pricing shown on step 1 |
| how-to-fill | informational | /reminder | Searcher is planning, usually more than 3 days out; the reminder is the useful answer and the lead event |
| app-problems | informational | /guide | The guide's problems table answers the query; then the CTA |
| customs-declaration | informational | /customs | Allowance table and calculator; not a government-document ad |
| transit | informational | /reminder | Planning-stage query; free reminder |

Every keyword is Phrase match. The first three per ad group are duplicated as Exact match so the search-terms report shows
which head terms drive orders. Totals per market (phrase + exact): EN 87, DE 74, ZH 73, FR 73, ES 73, JA 73, KO 73, ID 64.
Base phrase lists are 32–45 per market. Trim to the 30 best after two weeks of search-term data.

Sample of the EN list, to show the pattern:

| Ad group | Keywords |
|---|---|
| arrival-card-generic | indonesia arrival card, indonesia arrival card online, indonesia digital arrival card, arrival card indonesia, indonesian arrival card, e arrival card indonesia, indonesia arrival card assistance, indonesia entry card, indonesia arrival card help |
| bali-arrival-card | bali arrival card, bali arrival card online, arrival card bali, bali digital arrival card, bali entry card, bali arrival form, jakarta arrival card, lombok arrival card |
| app-problems | all indonesia app not working, all indonesia app problems, all indonesia arrival card not received, all indonesia qr code not received, arrival card indonesia error, all indonesia app crash, arrival card indonesia wrong date, retrieve arrival card indonesia |
| how-to-fill | how to fill indonesia arrival card, how to complete all indonesia arrival card, indonesia arrival card guide, when to fill indonesia arrival card, indonesia arrival card 72 hours, indonesia arrival card how many days before, bali arrival card when to apply, indonesia arrival card step by step |

The other seven languages follow the same eight groups with native search phrasing (e.g. DE "einreisekarte indonesien",
ZH "印尼入境卡", JA "インドネシア 入国カード", KO "인도네시아 입국카드", ID "kartu kedatangan"). ID has no evoa group.

### 3.2 Negatives and why

Applied to every campaign as campaign-level negatives (label `negative-shared`), plus a per-language set
(`negative-local`). Phrase match, so the negative removes any query containing the word.

| Negative | Reason |
|---|---|
| free, "for free" | The searcher wants the free official form. Showing a paid ad here is the exact complaint pattern in competitor reviews and a policy risk ("fees for a free service"). |
| official, government, gov, go.id | Navigational intent for the government site. Serving our ad there implies affiliation. |
| imigrasi, ditjen imigrasi, direktorat jenderal imigrasi, bea cukai, beacukai, satusehat, kemenimipas, kemenkumham, molina | Government brand names. Bidding on them is impersonation risk and gets the "Misrepresentation" flag. |
| login, log in, sign in | Portal or app login intent. Zero purchase intent; high complaint risk. |
| scam, fake, fraud, legit | Researching scams. Our ad next to "scam" queries hurts trust and CVR. |
| download, apk, app store, play store, ios, android | App download intent. |
| visa exemption, visa free, visa-free, exemption list | Eligibility research, not an arrival card or e-VOA purchase. |
| jobs, job, career, vacancy, salary, internship | Employment queries mentioning immigration. |
| kitas, kitap, work permit, student visa, second home, golden visa, b211, c1 visa, extension, overstay, deportation | Long-stay and legal immigration matters we do not handle. Also TikTok/Meta "immigration law" territory. |
| wikipedia, reddit, tripadvisor, news, meaning, pdf, sample, template, example | Pure information or document look-ups. |
| embassy, consulate | Consular services. |
| refund, chargeback, trustpilot, review | Post-purchase and reputation queries. |
| indonesia-portal, indonesia portal, indonesia-arrival.com | Competitor brands. Their searchers are checking whether that site is legitimate; not our traffic. |

Local sets repeat the same ideas per language (DE kostenlos/offiziell/behörde/betrug..., FR gratuit/officiel/arnaque...,
ES gratis/oficial/estafa..., ZH 免費/官方/政府/詐騙..., JA 無料/公式/詐欺..., KO 무료/공식/사기..., ID gratis/resmi/pemerintah/penipuan...).

Brand negatives to keep us clear of impersonation: everything in the "government brand names" row above. "all indonesia" is
deliberately **not** a negative: it is the descriptive name of the card and the head of the app-problems queries. The ads never
use it as our name (see 4).

Add weekly from the search-terms report: any query with "official", "gov", a government domain, or a competitor brand that
slipped through a different spelling.

---

## 4. Ads (docs/google-ads-rsa.csv)

63 responsive search ads: 8 markets × 8 ad groups (ID has 7). Each has 15 headlines (≤30 characters) and 4 descriptions
(≤90). For Chinese, Japanese and Korean the check counts full-width characters as two, as Google does. Path 1/Path 2 are
set per ad group (e.g. `arrival-card/assistance`, `guide/72-hours`).

Layout of every ad:

- Headlines 1–7: ad-group specific. Headline 1 is pinned to position 1.
- Headlines 8–15: shared set. Transactional: "Private Assistance Service", "Not A Government Website", "From $24.90 Per
  Traveler", "Price Shown Before You Start", "Human-Checked, Sent By Email", "Free 72-Hour Window Reminder", "Support
  07:00–23:00 WIB", "Full Refund If Delivered Late". Informational: "Private Assistance Service", "Not A Government Website",
  "Free Step-By-Step Guide", "Free 72-Hour Window Reminder", "Updated September 2026", "Links To The Official Portal",
  "No Account, No Payment Now", "Plain-Language Explanations".
- Description 1 is the disclosure and is pinned to position 1, so it always shows: "Private assistance service, not
  affiliated with any government website. Price shown first." (transactional) or "... Free guide." (informational).
- Descriptions 2–3: ad-group specific (price, delivery time, what is checked; or what the guide covers).
- Description 4: the 72-hour hook: "The portal opens only 72 h before arrival. We email you the moment your window opens."

Rules applied in every language:

- Never "official", never "government-approved", never an emblem. "All Indonesia" appears only inside the app-problems
  headline as the name of the app ("All Indonesia App Not Working?"), which is descriptive use of the product the user is
  searching for, never as our brand.
- Price visible in every transactional ad (headline and description), including the e-VOA split "$39.90 service fee plus
  IDR 500,000 visa fee".
- Informational ads carry no price and no "we submit" claim.
- Prices are in USD in all languages, as on the site (DE/FR/ES show "24,90 $", ID shows "US$24,90").

Example, EN / bali-arrival-card (transactional):

| # | Headline | Description |
|---|---|---|
| 1 | Bali Arrival Card Help (pinned) | Private assistance service, not affiliated with any government website. Price shown first. (pinned) |
| 2 | Landing In Bali? Card Prepared | Flying to Bali? We prepare and check your arrival card and email the QR before you land. |
| 3 | Bali Arrival Card, Checked | From $24.90 per traveler. Express under 2 hours. Support daily 07:00–23:00 Jakarta time. |
| 4 | QR Code Before You Fly To Bali | A person checks every field, submits inside the 72-hour window and emails your QR code. |
| 5–7 | Express Option Under 2 Hours · Works On Your Phone · Bali, Jakarta, All Airports | |
| 8–15 | shared transactional set | |

Example, DE / how-to-fill (informational): "So füllen Sie die Karte aus", "72-Stunden-Regel erklärt", "Wir mailen, wenn es
losgeht", "Jede Frage erklärt", "Portal & App erklärt", "Gesundheit & Zoll erklärt", "Jetzt Gratis-Erinnerung setzen" +
shared informational set; descriptions "Privater Assistenzdienst, mit keiner Regierungswebsite verbunden. Gratis-Leitfaden."
(pinned), "Leitfaden Einreisekarte Indonesien: was Sie brauchen, die 72-Stunden-Regel, jede Frage.", "Gratis-Erinnerung für
Ihr Datum. Maximal zwei E-Mails, kein Konto, Abmeldung per Klick.", "Das Portal öffnet erst 72 h vor Ankunft. Wir mailen,
sobald Ihr Fenster offen ist."

Chinese ads are Traditional (TW/HK/MO). The /zh landing page is Simplified; see section 6 before enabling ZH.

### 4.1 Final URLs

`https://allindonesia-arrivalcard.com{prefix}{path}?utm_source=google&utm_medium=cpc&utm_campaign={market}-{intent}&utm_content={adgroup}`
with prefix "" for EN and /de, /zh, /fr, /es, /ja, /ko, /id otherwise. Example:
`https://allindonesia-arrivalcard.com/ko/reminder?utm_source=google&utm_medium=cpc&utm_campaign=ko-informational&utm_content=how-to-fill`.
Google appends `gclid` by auto-tagging. Longest path+query is 106 characters, under the 200-character clip in
`lib/analytics-client.ts`.

### 4.2 Assets (add in the UI at campaign level; Editor's asset CSV format differs)

Sitelinks (text ≤25 characters; two description lines ≤35 each; final URL with the campaign's UTMs and `utm_content=sitelink-*`):

| Lang | Guide → /guide | Pricing → /pricing | e-VOA → /evoa | Reminder → /reminder |
|---|---|---|---|---|
| EN | Free guide | Pricing | e-VOA assistance | 72-hour reminder |
| DE | Gratis-Leitfaden | Preise | e-VOA-Assistenz | 72-Stunden-Erinnerung |
| ZH | 免費教學 | 價格 | e-VOA協助 | 72小時提醒 |
| FR | Guide gratuit | Tarifs | Assistance e-VOA | Rappel 72 h |
| ES | Guía gratuita | Precios | Asistencia e-VOA | Recordatorio 72 h |
| JA | 無料ガイド | 料金 | e-VOA代行 | 72時間リマインダー |
| KO | 무료 가이드 | 요금 | e-VOA 대행 | 72시간 알림 |
| ID | Panduan gratis | Harga | Bantuan e-VOA | Pengingat 72 jam |

In mode B, attach only Guide and Reminder sitelinks to the informational campaigns (Pricing and e-VOA point at paid pages).

Callouts (≤25 characters), attach the first four to informational campaigns, all six to transactional:

| Lang | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| EN | Private, not government | Not a government website | Free 72-hour reminder | Support 07:00–23:00 WIB | Price shown first | No hidden fees |
| DE | Privater Assistenzdienst | Keine Regierungswebsite | Gratis 72-h-Erinnerung | Support 07–23 Uhr Jakarta | Preis zuerst sichtbar | Keine versteckten Kosten |
| ZH | 私營協助服務 | 非政府網站 | 免費72小時提醒 | 客服07–23時雅加達 | 先看價格 | 無隱藏費用 |
| FR | Assistance privée | Site non gouvernemental | Rappel 72 h gratuit | Support 7h–23h Jakarta | Prix affiché d'abord | Aucun frais caché |
| ES | Asistencia privada | No es sitio del gobierno | Recordatorio 72 h gratis | Soporte 7–23 h Yakarta | Precio visible primero | Sin costes ocultos |
| JA | 民間サポート | 政府サイトではない | 無料72時間リマインダー | サポート7〜23時 | 料金を先に表示 | 追加料金なし |
| KO | 민간 지원 서비스 | 정부 웹사이트 아님 | 무료 72시간 알림 | 상담 07–23시 | 가격 먼저 표시 | 숨은 비용 없음 |
| ID | Layanan bantuan swasta | Bukan situs pemerintah | Pengingat 72 jam gratis | Dukungan 07–23 WIB | Harga tampil dulu | Tanpa biaya tersembunyi |

Structured snippet, header "Service catalog" (values ≤25 characters), transactional campaigns only:
EN "Arrival card assistance, e-VOA assistance, 72-hour reminder, Customs guidance"; DE "Einreisekarten-Assistenz,
e-VOA-Assistenz, 72-Stunden-Erinnerung, Zoll-Infos"; ZH "入境卡協助, e-VOA協助, 72小時提醒, 海關說明"; FR "Aide carte d'arrivée,
Assistance e-VOA, Rappel 72 h, Infos douane"; ES "Ayuda tarjeta de llegada, Asistencia e-VOA, Recordatorio 72 h, Guía de
aduana"; JA "入国カード代行, e-VOA代行, 72時間リマインダー, 税関ガイド"; KO "입국카드 대행, e-VOA 대행, 72시간 알림, 세관 안내";
ID "Bantuan kartu kedatangan, Bantuan e-VOA, Pengingat 72 jam, Panduan bea cukai".

Business name asset: "Arrival Card Assist". Logo asset: the site logo, no emblem. Price asset: skip (Google's price asset
format invites "official price" confusion in this category).

---

## 5. Conversions and tracking

What exists (docs/tracking.md, lib/tracking.ts, lib/analytics-client.ts, components/*Tracker*.tsx):
GA4 gtag + Meta pixel in the browser; `begin_checkout`, `generate_lead`, `purchase` from the browser; `purchase` again from
the server (GA4 Measurement Protocol + Meta CAPI) with deduplication; first-touch `utm_source/medium/campaign`, `gclid`,
`fbclid`, landing page stored 30 days in `localStorage` and sent with every order and reminder.

Google Ads setup (no new Google Ads tag; import from GA4):

| GA4 event | Google Ads action | Goal | Count | Value | Window | Attribution |
|---|---|---|---|---|---|---|
| purchase | Purchase (primary) | Purchases | Every | Use GA4 value (USD order total, government fee included) | 90-day click, 1-day view, 3-day engaged view | Data-driven; falls back to last click while data is thin |
| generate_lead | Reminder saved (secondary in mode A, primary in mode B) | Submit lead form | One | Static €3 (assumption: ~12 % of reminders become a $24.90 order) | 30-day click | Data-driven |
| begin_checkout | Reached pay step (secondary, observation only) | Other | One | none | 30-day click | – |

Steps: GA4 Admin > Key events > mark `purchase` and `generate_lead`. GA4 Admin > Product links > Google Ads > link the
account. Google Ads > Goals > Conversions > New > Import > Google Analytics 4 > Web > pick the two events. The 90-day window
matters: a reminder is set up to 90 days before arrival and the order happens inside the last 72 hours. The stored `gclid`
travels with the server-side purchase (`lib/tracking.ts` sends `gclid`, `source`, `medium`, `campaign`), so a late order still
lands on the original click in GA4. Google Ads itself only credits within its own window, hence 90 days.

Value: GA4 property currency USD, Google Ads account EUR. Google converts at the daily rate; report CPA in EUR and compare with
the USD targets in section 7 at ~0.92 EUR/USD, or set the account currency to USD if the bank card allows. Keep one.

Consent mode:

- EEA and UK traffic requires Consent Mode v2 for measurement, audiences and personalization since March 2024
  (support.google.com/google-ads/answer/13695607). The site has no consent banner and `components/Analytics.tsx` loads gtag
  and the pixel unconditionally.
- Until a certified CMP with `gtag('consent', 'default', {... 'denied'})` for EEA/UK/CH visitors is live, do not target DE,
  AT, CH, FR, BE, LU, ES, UK, IE, NL. The EN campaign starts with the non-European countries listed in 2.1.
- With the banner live: `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage` default denied in those
  regions, updated on accept; the server-side purchase event should then only be sent for orders whose attribution carries
  a consent flag (already noted in docs/tracking.md). This is a code change; it is listed in section 6, not done here.

UTM convention (consistent with `getAttribution()`):

- `utm_source=google`, `utm_medium=cpc`, `utm_campaign={market}-{intent}` (e.g. `de-informational`),
  `utm_content={adgroup}` (e.g. `bali-arrival-card`), optional `utm_term={keyword}` via a tracking template later.
- `utm_source`, `utm_medium`, `utm_campaign` and `gclid` are stored as first touch; `utm_content` is not stored as a field
  but is kept inside `landingPage` (path + query, clipped at 200 characters). Keep URLs short; the longest one shipped is
  106 characters.
- Meta: `utm_source=facebook|instagram`, `utm_medium=paid-social`, same campaign/content pattern. TikTok: `utm_source=tiktok`.
- Sitelinks: `utm_content=sitelink-guide|pricing|evoa|reminder`.

---

## 6. Landing page checklist (Google "Government documents and services" landing-page requirements plus general policy)

| Requirement | Status | Where | Action |
|---|---|---|---|
| Business name and legal identity visible | In place | Footer on every page (`components/Footer.tsx`: Bulan Juli Limited, address, CR/BR numbers, email); `/contact` | None |
| "Private entity, not affiliated with any government" above the fold | In place | Amber bar on every page (`components/Disclosure.tsx` in `app/[locale]/layout.tsx`); hero sentence on `/` and `/reminder`; full text at top of `/apply`; footer box; `/legal/disclosure` | None |
| Fee disclosed before personal data | In place | `/` PriceCard, `/pricing`, `/apply` step 1 "Price & travelers", `/evoa` itemised with the IDR 500,000 government fee | None |
| Statement that the document is free from the government, with a link to the official site | **Partial** | `OfficialNote` ("free of charge on the official government portal allindonesia.imigrasi.go.id") is on `/`, `/guide`, `/legal/disclosure`, `/legal/terms` only | **Add `OfficialNote` to `/apply`, `/reminder`, `/pricing`, `/evoa` (with the e-VOA portal link) and `/customs`.** These are the ad landing pages; a reviewer opens exactly these URLs |
| No government emblems, names or colours as branding | In place | `lib/config.ts` DISCLOSURE; header uses "Arrival Card Assist" | Keep. Note the domain contains "allindonesia" (see below) |
| Privacy policy covering ads tracking | In place, with a defect | `/legal/privacy` has the GA4/Meta paragraph (messages `Legal.privacy.cookies`) but shows "Template for legal review before launch" | **Remove the template line** on `/legal/privacy` and `/legal/terms` (`app/[locale]/legal/privacy/page.tsx` line 25, `.../terms/page.tsx` line 34) after the HK solicitor pass listed in docs/launch-checklist.md |
| Contact information | Partial | Email and support hours on `/contact` and footer; no phone or WhatsApp | Add a WhatsApp number or contact form. Not a hard policy requirement, but reviewers and card schemes weigh it |
| Refund policy | In place | `/legal/refunds`; "Full refund if not delivered 6 h before arrival" on `/pricing` | None |
| Consent banner + Consent Mode v2 for EEA/UK | **Missing** | `components/Analytics.tsx` loads tags unconditionally | **Add a certified CMP before any European targeting** |
| Landing language matches ad language | **Mismatch for ZH** | `/zh` is Simplified Chinese (`INTL_LOCALES.zh = zh-CN`, `messages/zh.json`); the ZH ads are Traditional for TW/HK/MO | Either add a `zh-Hant` locale (`i18n/routing.ts`, `messages/zh-Hant.json`) or start the ZH campaign in Singapore/Malaysia with a Simplified ad variant. Do not send Traditional ads to a Simplified page; Google scores it as a relevance problem and TW users bounce |
| Domain does not imply government affiliation | **Risk** | `allindonesia-arrivalcard.com` contains the programme name "All Indonesia" | Policy-wise the disclosures mitigate it, but a reviewer applying "Misrepresentation" may not read past the domain. docs/launch-checklist.md already keeps a neutral fallback domain in reserve. Decide before the certification application: if the neutral domain is used for ads, it must be the canonical site, not a redirect |
| Acknowledgement at checkout | In place | `acknowledgeNotGov` checkbox in `app/[locale]/apply/ApplyForm.tsx` | None |
| Page speed and mobile | Assumed OK (static Next.js) | – | Run PageSpeed on `/reminder` and `/apply` in each locale once; fix anything under 70 mobile |
| No misleading urgency | In place | The 72-hour rule is a real portal constraint and is explained | Keep it factual; never "last chance" |

---

## 7. Launch plan, KPIs, kill criteria

Unit economics used for targets: arrival card order $24.90 (net ≈ $23 after Airwallex, ops ≈ $2, contribution ≈ $21);
e-VOA $70.90 of which $31 is passed to the government (service fee $39.90, contribution ≈ $34). Extra travelers add $14.90
each, so average order value should sit near $32.

| KPI | Target (weeks 3–4) | Floor / kill |
|---|---|---|
| Search impression share, exact head terms | ≥ 40 % | – |
| CTR, transactional | ≥ 5 % | < 2 % after 1,000 impressions: rewrite |
| CTR, informational | ≥ 3 % | < 1.5 %: rewrite |
| CPC | within the ranges in 2.2 | > 2× the top of range for a week: lower caps or pause |
| CVR /apply → purchase (clicks inside window) | 4–8 % | – |
| CVR /apply → generate_lead (clicks outside window) | 10–20 % | – |
| CVR /reminder → generate_lead | 15–25 % | < 5 % after 300 clicks: page problem, pause |
| Reminder → order (30 days) | 10–15 % | < 5 %: fix the reminder email, not the ads |
| CPA purchase (arrival card) | target $9, max $12 | > $21 (contribution) over 2 weeks with ≥ 15 orders: pause the market |
| CPA purchase (e-VOA) | target $14, max $20 | > $34: pause the ad group |
| Cost per reminder lead | target $1.50, max $2.50 | > $4 with ≥ 100 leads: pause |
| Blended ROAS (Google-attributed revenue / cost) | ≥ 2.5 | < 1.5 at end of week 4: stop test |
| Dispute rate on ad-sourced orders | < 0.5 % | ≥ 0.75 %: pause paid acquisition, fix checkout |
| Policy | 0 strikes | Any account-level strike: stop all campaigns, appeal once, do not resubmit |

Week 0 (now, before spend)

- File the Ditjen Imigrasi letter (courier + email + ePPID). File Google advertiser verification and the certification
  application with the letter as the evidence. Verify the Meta business.
- Site changes from section 6: OfficialNote on the five pages, template line removed, CMP if Europe is in scope for week 1.
- GA4: key events, Ads link, imports. Place one dev-mode order and one reminder; see both in DebugView and in Google Ads
  (conversion status "Recording conversions" after 24–48 h).
- Import the two CSVs into Editor. Set locations, languages, ad schedules, assets. Post everything paused. Fix Editor's
  validation warnings (usually a duplicate keyword or an ad-strength notice).

Week 1: EN, ID, JA, KO informational (mode B) or transactional + informational (mode A if the certificate arrived).
Budget 50 % of plan. Check search terms daily; add negatives. Check disapprovals daily; appeal once with the informational
argument. Confirm `gclid` is present on incoming reminders (admin > reminders > attribution).

Week 2: add ZH (after the zh-Hant decision), DE, FR, ES (after the CMP). Raise to 100 % budget in markets whose CTR is
above floor. Switch campaigns with ≥ 15 conversions to Maximize conversions with a target CPA of $2 per lead / $12 per
purchase. First ad-copy test: swap Headline 1 between "help" and "prepared for you" variants in the EN transactional groups.

Week 3: trim keywords to the 30 best per market. Move budget from markets above max CPA to markets below target. Add the
sitelinks/callouts translations that are missing. Start the Meta Leads campaign (€250/week) in EN and DE pointing at /reminder.

Week 4: decide per market: scale (CPA below target), hold (between target and max), kill (above max). Write up: CPC actuals
vs. estimates, reminder-to-order rate, dispute count. Decide on Performance Max for leads (only if mode A) and on Bing.

Kill the whole test if by day 28: fewer than 30 purchases plus 300 leads across all markets, or blended ROAS under 1.5, or
any policy strike. Keep SEO, the reminder list and Meta running in that case.

---

## Sources (accessed 24 Sep 2026 via search snippets; primary pages blocked from this environment)

- Google, "Update to Other restricted businesses: Government documents and services policy (October 2026)":
  https://support.google.com/adspolicy/answer/17260489 (announced Aug 2026; enforced 5 Oct 2026)
- Google, "Other restricted businesses: Government documents and services": https://support.google.com/adspolicy/answer/13156083
- Search Engine Roundtable, "Google Ads Government Documents and Services Policy To Be Updated On October 5, 2026" (Aug 2026):
  https://www.seroundtable.com/google-ads-government-documents-and-services-41819.html
- Search Engine Land, "Google tightens Ads policy for government document providers" (Aug 2026):
  https://searchengineland.com/google-tightens-ads-policy-for-government-document-providers-484342
- PPC News Feed, "Update to Government Documents and Services Policy" (Aug 2026):
  https://ppcnewsfeed.com/ppc-news/2026-08/update-government-documents-services-policy/
- TechWyse, "Google Ads Tightens Government Documents Policy (Oct 2026)" (timelines 5–7 and 10–12 business days):
  https://www.techwyse.com/news/platform-updates/google-ads-government-documents-services-policy-update-october-2026
- Kliken Help Center, "Google Ads Policy Update: Government Documents and Services Disclosure (October 2025)" ("Not a
  government website" label): https://help.kliken.com/en/articles/12461228
- Google Ads Community threads on the certification form: https://support.google.com/google-ads/thread/391402543 ,
  https://support.google.com/google-ads/thread/247062722
- VisasNews, "Google tightens advertising rules for visas and ETAs" (2026): https://visasnews.com/en/google-tightens-advertising-rules-for-visas-and-etas/
- Google, "Updates to consent mode for traffic in EEA" (March 2024 requirement): https://support.google.com/google-ads/answer/13695607
- Microsoft Advertising, "Authorized third-party government services" policy and "Government services advertising program"
  form: https://about.ads.microsoft.com/en-us/resources/policies/third-party-governement-services-pilot ,
  https://about.ads.microsoft.com/en/forms/policies/third-party-government-services-pilot ; PPC News Feed, "Microsoft
  Advertising Rewrites Government Services Policy" (effective 19 Aug 2026):
  https://ppcnewsfeed.com/ppc-news/2026-08/microsoft-advertising-rewrites-government-services-policy/
- Meta Advertising Standards: https://transparency.meta.com/policies/ad-standards/ ; "Unacceptable Business Practices":
  https://transparency.meta.com/policies/ad-standards/fraud-scams/unacceptable-business-practices/ ; "Fraud, Scams and
  Deceptive Practices": https://transparency.meta.com/policies/ad-standards/fraud-scams/fraud-scams-deceptive-practices/ ;
  Stackmatix, "Meta Ads Policy 2026" (advertiser verification expansion): https://www.stackmatix.com/blog/meta-ads-policy
- TikTok Advertising Policies, "Other products and services" (immigration law services not allowed; legal services 18+):
  https://ads.tiktok.com/help/article/tiktok-ads-policy-other-products-and-services
- CPC benchmarks: LocaliQ, "Search Advertising Benchmarks [2026 Data]" (travel median CPC $2.17):
  https://localiq.com/blog/search-advertising-benchmarks/ ; PPCChief, "Travel & Hospitality Google Ads CPC: $2.12 (2026)":
  https://ppcchief.com/google-ads-cost/travel ; Media Spearhead, immigration-lawyer CPC $15–40:
  https://mediaspearhead.com/industries/immigration-lawyers/google-ads/ ; Lopokopi, "Biaya Google Ads Indonesia 2026":
  https://lopokopi.co/biaya-google-ads-indonesia/ ; Statista, travel Google Ads CPC by country (2024):
  https://www.statista.com/statistics/1402662/travel-googleads-cpc
- Ditjen Imigrasi contacts: https://www.imigrasi.go.id/ppid-page/kontak-eppid ; https://layanandata.imigrasi.go.id/front/contact ;
  https://kemenimipas.go.id/profil/tentang-kementerian-imigrasi-dan-pemasyarakatan-ri/kontak-kami ; Director General
  inauguration 1 Apr 2026: https://bengkulu.imigrasi.go.id/berita-utama/hendarsam-marantoko-resmi-dilantik-sebagai-direktur-jenderal-imigrasi
- Official portal and help: https://allindonesia.imigrasi.go.id/ , https://allindonesia.imigrasi.go.id/help
- Google Ads Editor CSV format: https://support.google.com/google-ads/editor/answer/56368 ,
  https://support.google.com/google-ads/editor/answer/57747
