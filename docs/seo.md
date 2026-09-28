# Technical SEO: what is in place, how to check it, what is left to do

Live site: https://allindonesia-arrivalcard.com. Eight locales: `en` (no prefix), `/de`, `/zh`, `/fr`, `/id`, `/ja`, `/ko`, `/es`.

## 1. Implemented (code)

| Signal | Where | Notes |
|---|---|---|
| `<html lang>` | `app/[locale]/layout.tsx` | One per page, the page locale |
| Canonical + hreflang | `i18n/seo.ts` (`pageMetadata`, `alternatesFor`) | Every public page: 1 self-canonical, 9 `hreflang` links (8 locales + `x-default` = English) |
| Open Graph / Twitter | `i18n/seo.ts` (`socialFor`) | Per-page URL, `og:locale` + alternates, `public/og.png` (1200×630) |
| Sitemap | `app/sitemap.ts` from `PUBLIC_PATHS` | 14 paths × 8 locales, each entry with its hreflang alternates |
| robots.txt | `app/robots.ts` | `Disallow: /admin`, `/api`; points at `/sitemap.xml` |
| noindex | `apply/success` (`pageMetadata` … `noindex`), `/admin` (layout metadata + `x-robots-tag` in `middleware.ts`), 404 (`[...rest]` → `notFound()`, Next adds `noindex` and a 404 status) | `apply/success` keeps a self-canonical but emits no hreflang. The 404 still carries the layout's home canonical/hreflang and Next's error shell has no `html lang`: Next ignores page metadata once `notFound()` is thrown, and crawlers drop every signal on a 404 response, so this is left as is |
| Canonical host | `middleware.ts` | `www.` and other aliases → 308 to the apex over https |
| JSON-LD `Organization` + `WebSite` (`@graph`) | `app/[locale]/layout.tsx` | Site-wide; logo `/icon.svg`, address, company id, contact point, 8 languages |
| JSON-LD `BreadcrumbList` + visible breadcrumbs | `components/Breadcrumbs.tsx` | Every public page except home; labels reuse `Header.nav` / `Footer` strings, "Home" from the `Breadcrumbs` namespace |
| JSON-LD `Service` + `Offer` | `app/[locale]/page.tsx`, `evoa`, `pricing` | Pricing lists first / additional traveler, e-VOA first / additional, express; all amounts from `lib/pricing.ts` |
| JSON-LD `HowTo` + `FAQPage` | `guide` | Portal steps and the guide FAQ |
| JSON-LD `FAQPage` | `faq`, `reminder` | Same questions as the visible accordions |
| JSON-LD `ItemList` of `NewsArticle` | `news` | Only when news items are available server-side |

Every JSON-LD block goes through `components/JsonLd.tsx`, which escapes `<` so no string can close the script tag.

## 2. How to validate

After each deploy (or locally with `npm run build && npx next start -p 3131`):

1. **Rich Results Test** (https://search.google.com/test/rich-results): paste `/`, `/pricing`, `/guide`, `/faq`, `/de/pricing`, `/ja/guide`. Expect Breadcrumbs, FAQ, HowTo (guide) and Organization detected, zero errors. Warnings about optional fields (aggregateRating, sameAs) are acceptable.
2. **Schema Markup Validator** (https://validator.schema.org) for the raw graph, including `Service`/`Offer` which Google's test does not report.
3. **Search Console → URL inspection**: "URL is on Google", the user-declared canonical equals the Google-selected canonical, and the "Enhancements" panel shows the breadcrumbs / FAQ.
4. **Quick shell check** (any page):
   ```sh
   curl -s http://localhost:3131/de/pricing | grep -o '<link rel="canonical"[^>]*>' | wc -l   # 1
   curl -s http://localhost:3131/de/pricing | grep -o 'hreflang="[^"]*"' | wc -l               # 9
   curl -s http://localhost:3131/sitemap.xml | grep -c '<loc>'                                # 112
   curl -sI http://localhost:3131/admin | grep -i x-robots                                    # noindex, nofollow
   ```
5. **Search Console → Sitemaps**: `https://allindonesia-arrivalcard.com/sitemap.xml` shows "Success" and 112 discovered URLs.
6. **Search Console → International targeting / Page indexing**: no "Alternate page with proper canonical tag" errors on the localized pages; `x-default` resolves to the English page.

## 3. User-side to-do (outside the code)

- [x] Google Search Console: property verified, sitemap submitted.
- [ ] **Bing Webmaster Tools**: sign in, choose "Import from Google Search Console" (verification, sitemap and URLs come across in one step). Re-check after a week that the sitemap shows 112 URLs.
- [ ] **Google Business Profile** for Bulan Juli Limited (Hong Kong address in `lib/config.ts`, category "Travel agency" or "Visa and passport office", website = apex domain, support email). Keep name identical to the `Organization.legalName` in the JSON-LD.
- [ ] **5–10 quality backlinks**, one at a time over 2–3 months: travel forums (TripAdvisor Bali/Indonesia forum, Reddit r/bali and r/indonesia only where self-promotion is allowed), expat blogs and newsletters (Bali/Jakarta expat sites), a Hong Kong company directory listing, and one or two travel-insurance or flight-comparison partners. Link to the guide or customs page rather than only the home page.
- [ ] **Monitor queries** in Search Console → Performance, filter "Indonesia arrival card" / "All Indonesia arrival card" / "e-VOA Indonesia": track impressions, average position and CTR per locale monthly; improve the title/description of any page with CTR < 2 % at position < 10.
- [ ] **No doorway pages**: do not add near-duplicate pages per city, airport or nationality. New landing pages must have unique content and a distinct purpose; otherwise Google treats them as spam and the whole site can lose rankings.
- [ ] Re-run the Rich Results Test whenever `lib/pricing.ts`, the FAQ lists or the guide steps change.
