import { db } from "../db";
import { nowISO } from "../dates";
import type { VisibilityAudit, VisibilityAuditCheck, VisibilityAuditPage } from "../types";
import { hostOf } from "./analyze";

/**
 * Technical audit: can AI crawlers reach ILA's public site and read it without running JavaScript? Fetches robots.txt,
 * llms.txt, the sitemap and a sample of pages, then turns what it finds into pass / warn / fail checks with the fix.
 * The parsers are pure and tested; only `runAudit` touches the network.
 */

/** Crawlers that feed AI assistants. "search" agents fetch pages to answer a live question; "training" agents build models. */
export const AI_BOTS: Array<{ agent: string; owner: string; use: "search" | "training"; ua: string }> = [
  { agent: "OAI-SearchBot", owner: "ChatGPT search", use: "search", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot" },
  { agent: "ChatGPT-User", owner: "ChatGPT browsing", use: "search", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot" },
  { agent: "GPTBot", owner: "OpenAI training", use: "training", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot" },
  { agent: "Claude-SearchBot", owner: "Claude search", use: "search", ua: "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)" },
  { agent: "Claude-User", owner: "Claude browsing", use: "search", ua: "Mozilla/5.0 (compatible; Claude-User/1.0; +https://www.anthropic.com)" },
  { agent: "ClaudeBot", owner: "Anthropic training", use: "training", ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" },
  { agent: "PerplexityBot", owner: "Perplexity index", use: "search", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)" },
  { agent: "Perplexity-User", owner: "Perplexity browsing", use: "search", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)" },
  { agent: "Google-Extended", owner: "Gemini (robots.txt token)", use: "training", ua: "" },
  { agent: "Googlebot", owner: "Google Search / AI Overviews", use: "search", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { agent: "Bingbot", owner: "Bing / Copilot (ChatGPT also uses Bing)", use: "search", ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" },
];

// ---------- robots.txt ----------

export interface Robots { groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }>; sitemaps: string[] }

export function parseRobots(text: string): Robots {
  const out: Robots = { groups: [], sitemaps: [] };
  let group: Robots["groups"][number] | null = null;
  let lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, "").trim();
    const i = clean.indexOf(":");
    if (i < 0) continue;
    const key = clean.slice(0, i).trim().toLowerCase();
    const value = clean.slice(i + 1).trim();
    if (key === "sitemap") { if (value) out.sitemaps.push(value); continue; }
    if (key === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (!group || !lastWasAgent) out.groups.push((group = { agents: [], rules: [] }));
      group.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && group) {
      // "Disallow:" with no path allows everything, so it is not a rule.
      if (value) group.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  return out;
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp(`^${body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
  return re.test(path);
}

/** Robots Exclusion Protocol: the agent's own group if there is one, else "*"; the longest matching rule wins, Allow on a tie. */
export function robotsAllows(robots: Robots, agent: string, path = "/"): boolean {
  const a = agent.toLowerCase();
  const own = robots.groups.filter((g) => g.agents.includes(a));
  const groups = own.length ? own : robots.groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of groups) for (const r of g.rules) {
    if (!ruleMatches(r.path, path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

// ---------- HTML ----------

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);

function metaContent(html: string, key: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = (attr(m[0], "name") ?? attr(m[0], "property") ?? "").toLowerCase();
    if (name === key) return decode(attr(m[0], "content") ?? "");
  }
  return undefined;
}

function schemaTypesOf(node: unknown, into: Set<string>) {
  if (Array.isArray(node)) { for (const n of node) schemaTypesOf(n, into); return; }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  for (const v of Array.isArray(t) ? t : [t]) if (typeof v === "string") into.add(v);
  if (o["@graph"]) schemaTypesOf(o["@graph"], into);
}

/** What a crawler that does not run JavaScript gets from a page. */
export function readPage(html: string): Pick<VisibilityAuditPage, "title" | "description" | "h1" | "canonical" | "noindex" | "words" | "schemaTypes"> {
  const types = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { schemaTypesOf(JSON.parse(m[1]), types); } catch { /* invalid JSON-LD is ignored, as crawlers do */ }
  }
  let canonical: string | undefined;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) if ((attr(m[0], "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical")) canonical = attr(m[0], "href");
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(html)?.[1] ?? html;
  const text = decode(body.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " "));
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title: title ? decode(title) || undefined : undefined,
    description: metaContent(html, "description") || undefined,
    h1: h1 ? decode(h1.replace(/<[^>]+>/g, " ")) || undefined : undefined,
    canonical,
    noindex: /\bnoindex\b/i.test(metaContent(html, "robots") ?? ""),
    words: text ? text.split(" ").length : 0,
    schemaTypes: [...types].sort(),
  };
}

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decode(m[1]));
}

// ---------- Scoring ----------

const THIN_WORDS = 150;
const ORG_TYPES = ["Organization", "LocalBusiness", "ProfessionalService", "LegalService", "AccountingService", "Corporation"];

export interface AuditFacts {
  home: VisibilityAuditPage | null;
  robots: Robots | null;
  bots: VisibilityAudit["bots"];
  llmsTxt: boolean;
  sitemapUrls: number;
  pages: VisibilityAuditPage[];
}

export function buildChecks(f: AuditFacts): VisibilityAuditCheck[] {
  const checks: VisibilityAuditCheck[] = [];
  const add = (id: string, label: string, status: VisibilityAuditCheck["status"], detail: string, fix?: string) => checks.push({ id, label, status, detail, fix: status === "pass" ? undefined : fix });
  const list = (xs: string[], max = 6) => xs.slice(0, max).join(", ") + (xs.length > max ? ` and ${xs.length - max} more` : "");
  const okPages = f.pages.filter((p) => p.status === 200 && !p.error);

  add("home", "Homepage answers", f.home?.status === 200 ? "pass" : "fail", f.home ? (f.home.error ?? `HTTP ${f.home.status} in ${f.home.ms} ms`) : "No response",
    "The site must answer with HTTP 200 on its main address. Check the domain, the hosting and any redirect loop.");

  const blocked = f.bots.filter((b) => !b.allowed).map((b) => b.agent);
  if (!f.robots) add("robots", "robots.txt", "warn", "No robots.txt found. Crawlers assume everything is allowed, but the file is where the sitemap is announced.", "Publish /robots.txt with `User-agent: *`, `Allow: /` and a `Sitemap:` line.");
  else add("robots", "robots.txt lets AI crawlers in", blocked.length ? "fail" : "pass", blocked.length ? `Blocked: ${list(blocked)}` : `All ${f.bots.length} AI crawlers may fetch the site.`,
    "Remove the Disallow rules for these agents (or add an explicit `Allow: /` group for each). A blocked crawler means that assistant cannot read or cite the site.");

  const refused = f.bots.filter((b) => b.httpStatus !== undefined && [401, 403, 406, 429, 503].includes(b.httpStatus));
  const probed = f.bots.filter((b) => b.httpStatus !== undefined);
  if (probed.length) add("firewall", "Server answers AI crawlers", refused.length ? "fail" : "pass", refused.length ? `Refused: ${refused.map((b) => `${b.agent} (HTTP ${b.httpStatus})`).join(", ")}` : `${probed.length} crawler user agents received the page.`,
    "The host or its firewall (Cloudflare \"Block AI bots\", a security plugin) rejects these user agents even though robots.txt allows them. Switch that rule off or allow-list the agents.");

  add("sitemap", "XML sitemap", f.sitemapUrls > 0 ? "pass" : "warn", f.sitemapUrls > 0 ? `${f.sitemapUrls} URLs listed.` : "No sitemap found at /sitemap.xml or in robots.txt.",
    "Publish a sitemap listing every public page and reference it from robots.txt, so new articles are discovered quickly.");

  add("llms", "llms.txt", f.llmsTxt ? "pass" : "warn", f.llmsTxt ? "Present." : "No /llms.txt. It is a young convention and not every assistant reads it, but it costs one file.",
    "Publish /llms.txt: a short Markdown file naming the company, what it does, and links to the key service and guide pages.");

  if (okPages.length) {
    const thin = okPages.filter((p) => p.words < THIN_WORDS);
    add("content", "Content readable without JavaScript", thin.length === 0 ? "pass" : thin.length > okPages.length / 2 ? "fail" : "warn",
      thin.length ? `${thin.length} of ${okPages.length} pages carry fewer than ${THIN_WORDS} words in their HTML: ${list(thin.map((p) => new URL(p.url).pathname))}` : `All ${okPages.length} sampled pages carry their text in the HTML.`,
      "AI crawlers do not run JavaScript. Pages whose text is injected by scripts look empty to them: render the content on the server (or pre-render it).");

    const homeTypes = f.home?.schemaTypes ?? [];
    const hasOrg = homeTypes.some((t) => ORG_TYPES.includes(t));
    const withSchema = okPages.filter((p) => p.schemaTypes.length > 0).length;
    add("schema", "Structured data (schema.org)", hasOrg && withSchema >= okPages.length / 2 ? "pass" : hasOrg || withSchema > 0 ? "warn" : "fail",
      `Homepage: ${homeTypes.length ? list(homeTypes) : "none"}. ${withSchema} of ${okPages.length} sampled pages carry JSON-LD.`,
      "Add JSON-LD: Organization (or ProfessionalService) with name, address, sameAs links on the homepage; Service on service pages; Article with author and dateModified, plus FAQPage, on guides.");

    const noTitle = okPages.filter((p) => !p.title);
    const noDesc = okPages.filter((p) => !p.description);
    const noH1 = okPages.filter((p) => !p.h1);
    const missing = [noTitle.length && `${noTitle.length} without <title>`, noDesc.length && `${noDesc.length} without meta description`, noH1.length && `${noH1.length} without <h1>`].filter(Boolean) as string[];
    add("meta", "Titles, descriptions and headings", missing.length === 0 ? "pass" : noTitle.length ? "fail" : "warn", missing.length ? missing.join(", ") + "." : "Every sampled page has a title, a meta description and an h1.",
      "Give each page a unique title, a 150-character description and one h1 that states what the page answers.");

    const hidden = okPages.filter((p) => p.noindex);
    add("noindex", "Pages open to indexing", hidden.length ? "warn" : "pass", hidden.length ? `noindex on: ${list(hidden.map((p) => new URL(p.url).pathname))}` : "No sampled page carries noindex.",
      "Remove the noindex robots meta tag from pages that should be found.");

    const times = okPages.map((p) => p.ms).sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    add("speed", "Response time", median <= 1500 ? "pass" : median <= 3500 ? "warn" : "fail", `Median ${median} ms to download the HTML (slowest ${times[times.length - 1]} ms).`,
      "Crawlers answering a live question give up on slow pages. Cache the HTML at the edge or speed up the server.");
  }
  const broken = f.pages.filter((p) => p.status !== 200 || p.error);
  if (f.pages.length) add("links", "Sitemap pages load", broken.length ? "warn" : "pass", broken.length ? `Not loading: ${list(broken.map((p) => `${new URL(p.url).pathname} (${p.error ?? p.status})`))}` : "Every sampled page returned HTTP 200.",
    "Fix or remove these URLs from the sitemap.");
  return checks;
}

export function scoreOf(checks: readonly VisibilityAuditCheck[]): number {
  if (!checks.length) return 0;
  return Math.round((checks.reduce((n, c) => n + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0) / checks.length) * 100);
}

// ---------- Crawl ----------

const BROWSER_UA = "Mozilla/5.0 (compatible; ILA-Office-Audit/1.0)";
const MAX_PAGES = 12;

/** A public DNS name only: the audit never fetches IP literals, localhost or internal names. */
export function isPublicHost(host: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host) && !/\.(local|internal|localhost|lan|home|corp)$/i.test(host);
}

async function get(url: string, ua = BROWSER_UA, timeoutMs = 15_000): Promise<{ status: number; ms: number; text: string; url: string; type: string; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!isPublicHost(new URL(res.url).hostname)) return { status: 0, ms: Date.now() - t0, text: "", url: res.url, type: "", error: "redirected off the public web" };
    const text = (await res.text()).slice(0, 2_000_000);
    return { status: res.status, ms: Date.now() - t0, text, url: res.url, type: res.headers.get("content-type") ?? "" };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, text: "", url, type: "", error: e instanceof Error && e.name === "TimeoutError" ? "timed out" : "no response" };
  }
}

/** Homepage first, then the shortest paths: the top-level pages are the ones that matter most. */
export function samplePages(home: string, locs: string[], host: string, max = MAX_PAGES): string[] {
  const same = [...new Set(locs)].filter((u) => { try { return hostOf(u) === host && !/\.(xml|pdf|jpg|png|webp)$/i.test(new URL(u).pathname); } catch { return false; } });
  const rest = same.filter((u) => new URL(u).pathname.replace(/\/$/, "") !== "").sort((a, b) => new URL(a).pathname.split("/").length - new URL(b).pathname.split("/").length || a.length - b.length);
  return [home, ...rest].slice(0, max);
}

export async function runAudit(domain: string): Promise<VisibilityAudit> {
  const host = hostOf(domain);
  if (!isPublicHost(host)) throw new Error(`"${domain}" is not a public domain name.`);
  const origin = `https://${host}`;
  const [homeRes, robotsRes, llmsRes] = await Promise.all([get(`${origin}/`), get(`${origin}/robots.txt`), get(`${origin}/llms.txt`)]);

  const isText = (r: { status: number; text: string; type: string }) => r.status === 200 && !!r.text.trim() && !/<html[\s>]/i.test(r.text.slice(0, 2000));
  const robots = isText(robotsRes) ? parseRobots(robotsRes.text) : null;

  const sitemapUrls = [...new Set([...(robots?.sitemaps ?? []), `${origin}/sitemap.xml`])].filter((u) => isPublicHost(hostOf(u))).slice(0, 3);
  let locs: string[] = [];
  for (const u of sitemapUrls) {
    const r = await get(u);
    if (r.status !== 200) continue;
    const found = sitemapLocs(r.text);
    if (/<sitemapindex[\s>]/i.test(r.text)) {
      for (const child of found.filter((c) => isPublicHost(hostOf(c))).slice(0, 5)) { const c = await get(child); if (c.status === 200) locs.push(...sitemapLocs(c.text)); }
    } else locs.push(...found);
    if (locs.length) break;
  }
  locs = [...new Set(locs)];

  const toPage = (url: string, r: Awaited<ReturnType<typeof get>>): VisibilityAuditPage => ({ url, status: r.status, ms: r.ms, error: r.error, ...readPage(r.status === 200 ? r.text : "") });
  const home = toPage(`${origin}/`, homeRes);
  const urls = samplePages(`${origin}/`, locs, host);
  const pages: VisibilityAuditPage[] = [home];
  for (let i = 1; i < urls.length; i += 4) pages.push(...await Promise.all(urls.slice(i, i + 4).map(async (u) => toPage(u, await get(u)))));

  const bots: VisibilityAudit["bots"] = await Promise.all(AI_BOTS.map(async (b) => ({
    agent: b.agent, owner: b.owner, allowed: robots ? robotsAllows(robots, b.agent) : true,
    httpStatus: b.ua && home.status === 200 ? (await get(`${origin}/`, b.ua, 12_000)).status || undefined : undefined,
  })));

  const checks = buildChecks({ home, robots, bots, llmsTxt: isText(llmsRes), sitemapUrls: locs.length, pages });
  const audit: VisibilityAudit = { id: db.newId(), domain: host, createdAt: nowISO(), score: scoreOf(checks), checks, bots, pages };
  await db.insert("visibility_audits", audit);
  return audit;
}
