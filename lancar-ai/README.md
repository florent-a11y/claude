# Lancar AI

Public website for **Lancar AI**, an on-site AI consultancy for small and medium businesses in Bali and Jakarta.
Indonesian (default) and English.

Stack: Next.js 15 (App Router) · React 19 · Tailwind 4 · next-intl (routing only) · zod · Anthropic SDK.
Supabase and Resend are optional and only used to keep and announce enquiries.

## Run locally
```bash
cd lancar-ai
npm install
cp .env.example .env.local   # everything is optional in development
npm run dev                  # http://localhost:3200
```
Without any keys: enquiries are written to `data/leads.json`, the "Book a free call" buttons lead to the contact
form, and the demo page shows a recorded conversation instead of the live assistant.

## Checks
```bash
npm run typecheck && npm test && npm run build
```

## What is on the site
| Page | Indonesian | English | Notes |
|---|---|---|---|
| Home | `/` | `/en` | Hero with an animated multilingual chat, services, method, sectors, prices, FAQ |
| Services | `/layanan` | `/en/services` | Six areas of work with examples |
| How we work | `/cara-kerja` | `/en/how-we-work` | Free call, on-site audit, build and train, accompany |
| Sectors | `/sektor`, `/sektor/<slug>` | `/en/sectors`, `/en/sectors/<slug>` | Hospitality and wellness, restaurants and retail, clinics and services, trading and manufacturing |
| Pricing | `/harga` | `/en/pricing` | Free call, audit by company size, fixed quotes |
| Live demo | `/demo` | `/en/demo` | Chat with a Claude-powered assistant for four fictional businesses |
| Readiness quiz | `/kuis` | `/en/quiz` | Ten questions, two scores, three ideas, then a lead form |
| Blog | `/blog`, `/blog/<slug>` | `/en/blog`, `/en/blog/<slug>` | Markdown articles |
| About, Contact, Privacy | `/tentang`, `/kontak`, `/privasi` | `/en/about`, `/en/contact`, `/en/privacy` | |

Design: white background with blue, gold and black (dark chat windows, closing panel and footer), with an italic serif (Instrument Serif) for highlighted
words. Sections fade up as they scroll into view, cards light up under the pointer, and the hero has drifting
light and flowing lines. All motion is switched off for visitors who ask their device to reduce motion, and
nothing depends on JavaScript to be readable.

A first visit to `/` follows the browser language. `sitemap.xml`, `robots.txt` and `llms.txt` (a plain-text summary
for AI assistants) are generated.

## Where to change things
| To change | Edit |
|---|---|
| Any text on the site | `content/en.ts` and `content/id.ts`. The Indonesian file is typed against the English one, so a key missing in one language fails `npm run typecheck`. |
| Audit prices | `AUDIT_TIERS` in `lib/config.ts` |
| WhatsApp number, email, company name, site address | Environment variables, see `.env.example` |
| Translated page addresses | `i18n/routing.ts` |
| Sector pages | Text in `content/*.ts` under `sectors.items`; slugs in `lib/sectors.ts` |
| Quiz questions and scoring | `lib/quiz.ts` (logic, tested in `tests/quiz.test.ts`) and `quiz` in `content/*.ts` (wording) |
| Demo businesses and what the assistant knows | `lib/demo.ts` |
| Colours, fonts and animation | `app/globals.css` (`@theme` for the palette; motion at the bottom of the file) |
| The gold italic words in headings | Wrap them in asterisks in `content/*.ts`: `"How *we work*"` |

### Adding a blog article
Create a folder under `content/blog/` with one file per language:
```
content/blog/my-article/en.md
content/blog/my-article/id.md
```
Each file starts with a header, then Markdown:
```
---
title: The title
description: One or two sentences for search results and the article list.
date: 2026-12-01
slug: the-url-of-the-article
---

## First heading
Text…
```
The slug can differ between languages. Commit and redeploy to publish.

## Enquiries (contact form and quiz)
`POST /api/leads` validates the form (`lib/leads.ts`), then:
1. stores the enquiry in the Supabase table `leads` when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
   (run `supabase/schema.sql` once);
2. emails it through Resend when `RESEND_API_KEY`, `EMAIL_FROM` and `LEADS_EMAIL` are set.

Either one is enough. **In production, if neither is configured the form tells the visitor it could not save the
message** and asks them to use WhatsApp, so no enquiry is lost silently. Quiz scores are recomputed on the server.

## Live demo
`/demo` talks to `POST /api/demo-chat`, which calls Claude (`claude-opus-5-5`, low effort, with Anthropic's
server-side fallback enabled) using the fact sheet of the chosen business as its only knowledge (`lib/demo.ts`).
The key stays on the server.

Cost controls: each message is capped at 600 characters and each conversation at 16 messages, replies are capped
in length, and each visitor is limited to 15 messages per 10 minutes. That limiter lives in memory per server
instance, so **also set a monthly spend limit on the API key in the Anthropic Console**: that is the hard cap.
Without `ANTHROPIC_API_KEY` the page shows a recorded example and makes no API calls.

## Deploy (Vercel)
1. New Vercel project from this repository with **Root Directory = `lancar-ai`**.
2. Add the environment variables from `.env.example` (at least `NEXT_PUBLIC_SITE_URL`,
   `NEXT_PUBLIC_WHATSAPP_NUMBER`, and one of the two enquiry channels).
3. Point the domain at the project and set `NEXT_PUBLIC_SITE_URL` to it.

## Before going live
- Company: set `NEXT_PUBLIC_LEGAL_NAME`, and have the privacy notice (`privacy` in `content/*.ts`) reviewed.
- Check the name "Lancar AI" for trademark (PDKI) and domain availability.
- Confirm the commitments written in the copy: visit length per audit tier, report within seven working days,
  confidentiality agreement before the visit, two-year retention of enquiries.
- Add real people to the About page once names and photos are available.
