import { isLive, type Post } from "./blog";
import { LOCALE_CODES } from "./schema";

/**
 * What the "SEO & AI" console module manages. Everything here is plain data and pure functions, so it can be
 * tested without a server: lib/seo.ts stores and applies it.
 */
export type SeoLocale = (typeof LOCALE_CODES)[number];

/** Crawlers that feed AI assistants. "search" ones fetch pages to answer a live question and usually link back;
 *  "training" ones collect text to build models. Blocking a search crawler removes you from that assistant's answers. */
export const AI_CRAWLERS: Array<{ agent: string; owner: string; use: "search" | "training" }> = [
  { agent: "OAI-SearchBot", owner: "ChatGPT search", use: "search" },
  { agent: "ChatGPT-User", owner: "ChatGPT, when someone asks it to open a page", use: "search" },
  { agent: "Claude-SearchBot", owner: "Claude search", use: "search" },
  { agent: "Claude-User", owner: "Claude, when someone asks it to open a page", use: "search" },
  { agent: "PerplexityBot", owner: "Perplexity", use: "search" },
  { agent: "Perplexity-User", owner: "Perplexity, live browsing", use: "search" },
  { agent: "MistralAI-User", owner: "Mistral Le Chat, live browsing", use: "search" },
  { agent: "DuckAssistBot", owner: "DuckDuckGo AI answers", use: "search" },
  { agent: "Amazonbot", owner: "Amazon (Alexa)", use: "search" },
  { agent: "GPTBot", owner: "OpenAI, model training", use: "training" },
  { agent: "ClaudeBot", owner: "Anthropic, model training", use: "training" },
  { agent: "Google-Extended", owner: "Google Gemini, training and grounding", use: "training" },
  { agent: "Applebot-Extended", owner: "Apple Intelligence, training", use: "training" },
  { agent: "Meta-ExternalAgent", owner: "Meta AI, training", use: "training" },
  { agent: "CCBot", owner: "Common Crawl, used by many AI labs", use: "training" },
];

/** The pages whose title and description can be edited in the console. Articles have their own in the blog editor. */
export const SEO_PAGES = [
  { path: "/", label: "Home" },
  { path: "/iv-drips", label: "IV drips" },
  { path: "/peptides", label: "Peptides" },
  { path: "/supplements", label: "Supplements" },
  { path: "/memberships", label: "Memberships" },
  { path: "/how-it-works", label: "How it works" },
  { path: "/delivery", label: "Delivery and areas" },
  { path: "/blog", label: "Blog" },
  { path: "/faq", label: "FAQ" },
  { path: "/contact", label: "Contact" },
] as const;
export type SeoPath = (typeof SEO_PAGES)[number]["path"];

export interface PageText { title: string; description: string }

export interface SeoSettings {
  /** Your own title and description per page and language. Anything left empty uses the site's built-in wording. */
  pages: Record<string, Partial<Record<SeoLocale, Partial<PageText>>>>;
  /** AI crawlers you have chosen to refuse. */
  blockedCrawlers: string[];
  /** The "facts about this business" published in /llms.txt. Empty means the built-in list. */
  llmsFacts: string[];
  /** Ownership codes from the search consoles (the `content` value of the meta tag they give you). */
  verification: { google: string; bing: string; yandex: string };
  /** IndexNow key: lets the site tell Bing and Yandex about a new article the moment it is published. */
  indexNowKey: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SEO: SeoSettings = { pages: {}, blockedCrawlers: [], llmsFacts: [], verification: { google: "", bing: "", yandex: "" }, indexNowKey: "" };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Whatever was stored, tidied into valid settings (unknown crawlers and languages dropped, lengths capped). */
export function normalizeSeo(raw: unknown): SeoSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pages: SeoSettings["pages"] = {};
  for (const [path, byLocale] of Object.entries((r.pages && typeof r.pages === "object" ? r.pages : {}) as Record<string, unknown>)) {
    if (!path.startsWith("/") || path.length > 120 || !byLocale || typeof byLocale !== "object") continue;
    for (const locale of LOCALE_CODES) {
      const v = (byLocale as Record<string, unknown>)[locale] as Record<string, unknown> | undefined;
      const title = text(v?.title, 120);
      const description = text(v?.description, 320);
      if (title || description) (pages[path] ??= {})[locale] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
    }
  }
  const known = new Set(AI_CRAWLERS.map((c) => c.agent));
  const v = (r.verification && typeof r.verification === "object" ? r.verification : {}) as Record<string, unknown>;
  const key = text(r.indexNowKey, 64);
  return {
    pages,
    blockedCrawlers: Array.isArray(r.blockedCrawlers) ? [...new Set(r.blockedCrawlers.filter((a): a is string => typeof a === "string" && known.has(a)))] : [],
    llmsFacts: Array.isArray(r.llmsFacts) ? r.llmsFacts.map((f) => text(f, 400)).filter(Boolean).slice(0, 20) : [],
    verification: { google: verificationCode(v.google), bing: verificationCode(v.bing), yandex: verificationCode(v.yandex) },
    indexNowKey: /^[a-f0-9]{32}$/.test(key) ? key : "",
    ...(text(r.updatedAt, 40) ? { updatedAt: text(r.updatedAt, 40) } : {}),
    ...(text(r.updatedBy, 80) ? { updatedBy: text(r.updatedBy, 80) } : {}),
  };
}

/** People paste the whole meta tag; only the code inside content="…" is kept. */
export function verificationCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const m = /content\s*=\s*["']([^"']+)["']/i.exec(raw);
  return (m ? m[1] : raw).replace(/[^A-Za-z0-9_\-=.]/g, "").slice(0, 120);
}

/** The text a page really uses: your override where you wrote one, the built-in wording elsewhere. */
export function effectiveText(settings: SeoSettings, path: string, locale: SeoLocale, defaults: PageText): PageText & { titleEdited: boolean; descriptionEdited: boolean } {
  const o = settings.pages[path]?.[locale];
  return { title: o?.title || defaults.title, description: o?.description || defaults.description, titleEdited: Boolean(o?.title), descriptionEdited: Boolean(o?.description) };
}

/** Lengths search engines show in full: titles of about 20 to 65 characters, descriptions of about 110 to 165. */
export const TITLE_RANGE: [number, number] = [20, 65];
export const DESCRIPTION_RANGE: [number, number] = [110, 165];
export type LengthStatus = "empty" | "short" | "good" | "long";
export function lengthStatus(value: string, [min, max]: [number, number]): LengthStatus {
  const n = value.trim().length;
  return n === 0 ? "empty" : n < min ? "short" : n > max ? "long" : "good";
}

export interface AuditItem { id: string; status: "pass" | "warn" | "fail"; label: string; detail: string; fix?: string }

export interface AuditInput {
  demo: boolean;
  siteUrl: string;
  settings: SeoSettings;
  /** Every editable page in every language, with the text it really uses. */
  pages: Array<{ path: string; label: string; locale: SeoLocale } & PageText>;
  posts: Post[];
  business: { whatsapp: string; address: string; company: string };
  now?: Date;
}

/**
 * The health check shown at the top of the module. It reads the site's own data (no outside calls), so it is
 * instant. It checks what you can control: visibility, wording lengths, AI access, articles, business details.
 */
export function auditSite(input: AuditInput): AuditItem[] {
  const out: AuditItem[] = [];
  const add = (id: string, status: AuditItem["status"], label: string, detail: string, fix?: string) => out.push({ id, status, label, detail, ...(status === "pass" || !fix ? {} : { fix }) });
  const now = input.now ?? new Date();
  const names = (list: string[], max = 4) => list.slice(0, max).join(", ") + (list.length > max ? ` and ${list.length - max} more` : "");

  add("visible", input.demo ? "fail" : "pass", "Visible to search engines and AI assistants",
    input.demo ? "This is the test site: every page tells search engines and AI crawlers to stay away." : "Search engines and AI crawlers may read the public pages.",
    "Nothing to fix while testing. At launch, remove DEMO_MODE in Vercel and redeploy.");

  let host = "";
  try { host = new URL(input.siteUrl).hostname; } catch { /* reported below */ }
  const temporary = !host || host === "localhost" || host.endsWith(".vercel.app");
  add("domain", temporary ? "warn" : "pass", "Own domain", temporary ? `The site runs on a temporary address (${host || "none"}). Links and rankings earned there do not carry over.` : `The site is published at ${host}.`,
    "Connect your domain in Vercel and set NEXT_PUBLIC_SITE_URL to it before you start promoting the site.");

  const badTitles = input.pages.filter((p) => lengthStatus(p.title, TITLE_RANGE) !== "good");
  add("titles", badTitles.length ? "warn" : "pass", "Page titles", badTitles.length ? `${badTitles.length} of ${input.pages.length} titles are too short or too long: ${names(badTitles.map((p) => `${p.label} (${p.locale.toUpperCase()})`))}.` : `All ${input.pages.length} titles are between ${TITLE_RANGE[0]} and ${TITLE_RANGE[1]} characters.`,
    "Edit them below. Put the main words people search for first, then the place, then the brand.");

  const badDesc = input.pages.filter((p) => lengthStatus(p.description, DESCRIPTION_RANGE) !== "good");
  add("descriptions", badDesc.length ? "warn" : "pass", "Page descriptions", badDesc.length ? `${badDesc.length} of ${input.pages.length} descriptions are too short or too long: ${names(badDesc.map((p) => `${p.label} (${p.locale.toUpperCase()})`))}.` : `All ${input.pages.length} descriptions are between ${DESCRIPTION_RANGE[0]} and ${DESCRIPTION_RANGE[1]} characters.`,
    "Edit them below. One or two sentences that say what the page offers and why to click.");

  const blocked = AI_CRAWLERS.filter((c) => input.settings.blockedCrawlers.includes(c.agent));
  const blockedSearch = blocked.filter((c) => c.use === "search");
  add("crawlers", blockedSearch.length ? "warn" : "pass", "AI assistants can read the site",
    blockedSearch.length ? `${blockedSearch.length} AI search crawler(s) are refused: ${names(blockedSearch.map((c) => c.agent))}. Those assistants cannot quote or link the site.`
      : blocked.length ? `All AI search crawlers are allowed. ${blocked.length} training crawler(s) are refused by your choice: ${names(blocked.map((c) => c.agent))}.` : `All ${AI_CRAWLERS.length} AI crawlers are allowed.`,
    "Allow them again in the AI access section below, unless the refusal is deliberate.");

  const live = input.posts.filter((p) => isLive(p, now));
  const missing = LOCALE_CODES.filter((l) => !live.some((p) => p.locale === l));
  add("articles", live.length === 0 ? "warn" : missing.length ? "warn" : "pass", "Articles in every language",
    live.length === 0 ? "No article is published yet. Articles are what search engines and AI assistants quote." : missing.length ? `${live.length} article(s) are live, but none in: ${missing.map((l) => l.toUpperCase()).join(", ")}.` : `${live.length} articles are live, with at least one in each language.`,
    "Write or translate articles in the Blog section.");

  if (live.length) {
    const noReview = live.filter((p) => !p.reviewer.trim());
    add("reviewed", noReview.length ? "warn" : "pass", "Articles reviewed by a doctor", noReview.length ? `${noReview.length} of ${live.length} live articles name no medical reviewer. For health topics, search engines and AI assistants favour content checked by a named professional.` : "Every live article names its medical reviewer.",
      "Have a doctor read each article, then enter their name and credentials in the article's \"Reviewed by\" field.");
    const thin = live.filter((p) => p.sources.length < 2 || p.faq.length < 2 || p.takeaways.length < 3);
    add("citable", thin.length ? "warn" : "pass", "Articles easy to quote", thin.length ? `${thin.length} of ${live.length} live articles lack sources, questions and answers, or key takeaways: ${names(thin.map((p) => `"${p.title}"`), 3)}.` : "Every live article has key takeaways, sources and questions with answers.",
      "Open the article in the Blog section and follow its checklist.");
  }

  const lacks = [!input.business.whatsapp && "phone (WhatsApp)", !input.business.address && "street address", !input.business.company && "company name"].filter(Boolean) as string[];
  add("business", lacks.length ? "warn" : "pass", "Business details for search and AI", lacks.length ? `The business description given to search engines lacks: ${lacks.join(", ")}. Assistants answering "where" and "how to contact" rely on these.` : "Phone, address and company name are published in the site's structured data.",
    "Set NEXT_PUBLIC_WHATSAPP, NEXT_PUBLIC_CLINIC_ADDRESS and NEXT_PUBLIC_COMPANY_NAME in Vercel.");

  const v = input.settings.verification;
  const consoles = [v.google && "Google", v.bing && "Bing", v.yandex && "Yandex"].filter(Boolean) as string[];
  add("consoles", consoles.length ? "pass" : "warn", "Search consoles connected", consoles.length ? `Ownership is verified for: ${consoles.join(", ")}.` : "No search console is connected, so you cannot see which searches bring visitors or submit the sitemap.",
    "Create free accounts at Google Search Console, Bing Webmaster Tools (it also feeds ChatGPT search) and Yandex Webmaster (for Russian-speaking visitors), then paste their codes below.");

  add("indexnow", input.settings.indexNowKey ? "pass" : "warn", "Instant notice of new articles (IndexNow)", input.settings.indexNowKey ? "Bing and Yandex are told about each article the moment it is published." : "Off. Bing, Yandex and the assistants that use them learn about a new article only when they next visit.",
    "Create a key below. It takes one click.");

  return out;
}
