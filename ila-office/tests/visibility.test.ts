import { test } from "node:test";
import assert from "node:assert/strict";
import { domainIn, firstMention, hostOf, scoreAnswer, toCitations } from "../lib/visibility/analyze";
import { buildChecks, isPublicHost, parseRobots, readPage, robotsAllows, samplePages, scoreOf, sitemapLocs } from "../lib/visibility/audit";
import { parseArticle } from "../lib/visibility/claude";
import { parseGemini, parseOpenAI, parsePerplexity } from "../lib/visibility/engines";
import { renderMarkdown } from "../lib/visibility/markdown";
import { brandRows, citedInstead, promptRows, rescore, sourceRows, summarise } from "../lib/visibility/metrics";
import type { AiEngine, VisibilityAnswer, VisibilityAuditPage, VisibilityConfig, VisibilityPrompt } from "../lib/types";

/** AI visibility: answer scoring, metrics, provider response parsing, the site audit and the Markdown renderer (synthetic data). */

const config: VisibilityConfig = {
  brandName: "ILA Global Consulting", brandAliases: ["ILA Global"], domains: ["ilaglobalconsulting.com"], description: "",
  competitors: [{ name: "Emerhub", domains: ["emerhub.com"] }, { name: "Cekindo", aliases: ["InCorp Indonesia"], domains: ["cekindo.com", "incorp.asia"] }],
};
const cite = (url: string) => toCitations([{ url }])[0];
let n = 0;
function answer(promptId: string, engine: AiEngine, text: string, urls: string[] = [], extra: Partial<VisibilityAnswer> = {}): VisibilityAnswer {
  const citations = toCitations(urls.map((url) => ({ url })));
  return { id: `a${++n}`, runId: "r1", promptId, engine, model: "m", askedAt: "2026-11-13T00:00:00Z", text, citations, ...scoreAnswer(text, citations, config), ...extra };
}

test("hostOf and domainIn: scheme, www and subdomains", () => {
  assert.equal(hostOf("https://www.Emerhub.com/blog?x=1"), "emerhub.com");
  assert.equal(hostOf("emerhub.com"), "emerhub.com");
  assert.equal(hostOf("not a url"), "");
  assert.equal(domainIn("blog.emerhub.com", ["emerhub.com"]), true);
  assert.equal(domainIn("notemerhub.com", ["emerhub.com"]), false, "a suffix that is not a subdomain does not match");
});

test("firstMention: whole words only, any case, spaces match line breaks", () => {
  assert.equal(firstMention("We flew to Manila with Emilia.", ["ILA"]), -1, "ILA inside Manila is not a mention");
  assert.ok(firstMention("Firms such as ila global\nconsulting help.", ["ILA Global Consulting"]) > 0);
  assert.ok(firstMention("Try Emerhub's guide", ["Emerhub"]) >= 0, "a possessive still counts");
  assert.equal(firstMention("Emerhubs", ["Emerhub"]), -1);
  assert.equal(firstMention("anything", ["", "x"]), -1, "names shorter than two characters are ignored");
});

test("toCitations: drops tracking parameters and duplicates, keeps a given domain", () => {
  const c = toCitations([
    { url: "https://emerhub.com/a?utm_source=chatgpt.com#top", title: " Guide " }, { url: "https://emerhub.com/a" },
    { url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", domain: "cekindo.com" }, { url: "nope" },
  ]);
  assert.deepEqual(c.map((x) => [x.url, x.domain, x.title]), [["https://emerhub.com/a", "emerhub.com", "Guide"], ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "cekindo.com", undefined]]);
});

test("scoreAnswer: brand named, brand cited, competitors in order of appearance", () => {
  const s = scoreAnswer("Cekindo and Emerhub are common picks; ILA Global is a Bali option.", [cite("https://www.ilaglobalconsulting.com/pt-pma")], config);
  assert.deepEqual(s, { brandMentioned: true, brandCited: true, competitors: ["Cekindo", "Emerhub"] });
  const t = scoreAnswer("Costs vary by agent.", [cite("https://incorp.asia/x")], config);
  assert.deepEqual(t, { brandMentioned: false, brandCited: false, competitors: ["Cekindo"] }, "a citation alone counts for the competitor, through any of its domains");
  assert.equal(scoreAnswer("See ilaglobalconsulting.com for fees.", [], config).brandMentioned, true, "the bare domain in the text is a mention");
});

test("summarise: visibility, share of voice and sentiment leave failed answers out", () => {
  const answers = [
    answer("p1", "chatgpt", "Emerhub and Cekindo."),
    answer("p1", "claude", "ILA Global Consulting is recommended.", [], { sentiment: "positive" }),
    answer("p2", "chatgpt", "ILA Global is one option, Emerhub another.", [], { sentiment: "neutral" }),
    answer("p2", "claude", "Nobody in particular."),
    answer("p2", "gemini", "", [], { error: "HTTP 500" }),
  ];
  const s = summarise(answers);
  assert.equal(s.answers, 4); assert.equal(s.errors, 1);
  assert.equal(s.visibility, 0.5);
  assert.equal(s.shareOfVoice, 2 / 5, "2 ILA appearances against 3 competitor appearances");
  assert.equal(s.positive, 0.5);
  assert.equal(summarise([answer("p1", "chatgpt", "Emerhub.")]).positive, null, "no rated answer gives no sentiment figure");
  assert.deepEqual(summarise([]), { answers: 0, errors: 0, visibility: 0, shareOfVoice: 0, positive: null });
});

test("promptRows and citedInstead: per-assistant status and who is put forward", () => {
  const prompts: VisibilityPrompt[] = [{ id: "p1", text: "cost of a PT", active: true, createdAt: "" }, { id: "p2", text: "never asked", active: true, createdAt: "" }];
  const answers = [
    answer("p1", "chatgpt", "Cekindo first, then Emerhub.", ["https://emerhub.com/a"]),
    answer("p1", "claude", "Emerhub.", ["https://emerhub.com/a"]),
    answer("p1", "gemini", "General advice.", ["https://ilaglobalconsulting.com/x"]),
    answer("p1", "perplexity", "", [], { error: "timed out" }),
  ];
  const [r1, r2] = promptRows(prompts, answers, config);
  assert.deepEqual(r1.engines, { chatgpt: "absent", claude: "absent", gemini: "cited", perplexity: "error" });
  assert.equal(r1.asked, 3); assert.equal(r1.visible, 1);
  assert.equal(r1.citedInstead, "Emerhub", "first place in one answer plus second place in another beats one first place");
  assert.deepEqual(r2.engines, { chatgpt: "none", claude: "none", gemini: "none", perplexity: "none" });
  assert.equal(citedInstead([answer("p3", "chatgpt", "Check the rules.", ["https://oss.go.id/a", "https://oss.go.id/b", "https://pajak.go.id/x"])], config), "oss.go.id", "without a competitor, the most cited outside site");
});

test("brandRows and sourceRows: ILA beside competitors, sources by kind", () => {
  const answers = [
    answer("p1", "chatgpt", "Emerhub.", ["https://emerhub.com/a", "https://oss.go.id/x"]),
    answer("p1", "claude", "Emerhub or ILA Global.", ["https://emerhub.com/a", "https://ilaglobalconsulting.com/p"]),
    answer("p2", "chatgpt", "Cekindo.", ["https://oss.go.id/x"]),
  ];
  const rows = brandRows(answers, config);
  assert.deepEqual(rows.map((r) => [r.name, r.appearances]), [["Emerhub", 2], ["ILA Global Consulting", 1], ["Cekindo", 1]], "ILA sorts ahead of a competitor on a tie");
  assert.equal(rows[0].shareOfVoice, 0.5);
  assert.deepEqual(rows[1].byEngine, { chatgpt: 0, claude: 1 });
  const sources = sourceRows(answers, config);
  assert.deepEqual(sources.map((s) => [s.domain, s.kind, s.answers, s.prompts]), [["emerhub.com", "competitor", 2, 1], ["oss.go.id", "other", 2, 2], ["ilaglobalconsulting.com", "own", 1, 1]]);
  assert.equal(sources[0].pages[0].answers, 2);
});

test("rescore: a competitor added later is found in stored answers", () => {
  const stored = [answer("p1", "chatgpt", "Ask LetsMoveIndonesia.")];
  assert.deepEqual(stored[0].competitors, []);
  const again = rescore(stored, { ...config, competitors: [...config.competitors, { name: "LetsMoveIndonesia", domains: [] }] });
  assert.deepEqual(again[0].competitors, ["LetsMoveIndonesia"]);
});

test("provider responses: text and citations from OpenAI, Gemini and Perplexity shapes", () => {
  const openai = parseOpenAI({ output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "A PT costs…", annotations: [{ type: "url_citation", url: "https://emerhub.com/a", title: "Emerhub" }, { type: "file_citation" }] }] }] });
  assert.deepEqual(openai, { text: "A PT costs…", citations: [{ url: "https://emerhub.com/a", title: "Emerhub" }] });
  const gemini = parseGemini({ candidates: [{ content: { parts: [{ text: "Part one. " }, { text: "Part two." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/r/1", title: "cekindo.com" } }, { web: { uri: "https://x.test/y", title: "A page title" } }] } }] });
  assert.equal(gemini.text, "Part one. Part two.");
  assert.deepEqual(gemini.citations.map((c) => c.domain), ["cekindo.com", undefined], "a title that is a host name is the real domain behind the redirect");
  assert.deepEqual(parsePerplexity({ choices: [{ message: { content: "Yes." } }], search_results: [{ title: "T", url: "https://a.test/1" }], citations: ["https://b.test/2"] }).citations, [{ url: "https://a.test/1", title: "T" }]);
  assert.deepEqual(parsePerplexity({ choices: [{ message: { content: "Yes." } }], citations: ["https://b.test/2"] }).citations, [{ url: "https://b.test/2" }], "older responses carry bare URLs");
  assert.deepEqual(parseOpenAI({}), { text: "", citations: [] });
});

test("robots.txt: own group over the wildcard, longest rule wins, empty Disallow allows", () => {
  const robots = parseRobots(["User-agent: *", "Disallow: /admin/", "Allow: /", "", "User-agent: GPTBot", "User-agent: ClaudeBot # training", "Disallow: /", "", "User-agent: PerplexityBot", "Disallow:", "Sitemap: https://x.test/sitemap.xml"].join("\n"));
  assert.deepEqual(robots.sitemaps, ["https://x.test/sitemap.xml"]);
  assert.equal(robotsAllows(robots, "GPTBot"), false);
  assert.equal(robotsAllows(robots, "claudebot"), false, "agent names are case-insensitive and may share a group");
  assert.equal(robotsAllows(robots, "PerplexityBot"), true);
  assert.equal(robotsAllows(robots, "OAI-SearchBot"), true, "falls back to *");
  assert.equal(robotsAllows(robots, "OAI-SearchBot", "/admin/x"), false);
  const wild = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /private\nAllow: /private/open");
  assert.equal(robotsAllows(wild, "X", "/a/b.pdf"), false);
  assert.equal(robotsAllows(wild, "X", "/a/b.pdf?x"), true);
  assert.equal(robotsAllows(wild, "X", "/private/open/page"), true);
  assert.equal(robotsAllows(parseRobots(""), "GPTBot"), true, "no rule allows everything");
});

test("readPage: what a crawler without JavaScript reads", () => {
  const p = readPage(`<html><head><title> PT PMA &amp; visas </title><meta content="Setup in Bali" name="description"><meta name="robots" content="index, follow">
    <link rel="canonical" href="https://x.test/"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["FAQPage","WebPage"]}]}</script>
    <script type="application/ld+json">{broken</script></head><body><h1>Company <em>setup</em></h1><script>var hidden = "not counted words here";</script><p>One two three four.</p></body></html>`);
  assert.equal(p.title, "PT PMA & visas"); assert.equal(p.description, "Setup in Bali"); assert.equal(p.h1, "Company setup");
  assert.equal(p.canonical, "https://x.test/"); assert.equal(p.noindex, false);
  assert.deepEqual(p.schemaTypes, ["FAQPage", "Organization", "WebPage"]);
  assert.equal(p.words, 6, "script content is not page text");
  const shell = readPage(`<html><head><meta name="robots" content="NOINDEX"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
  assert.equal(shell.words, 0); assert.equal(shell.noindex, true); assert.equal(shell.title, undefined);
});

test("sitemap and page sample: locations, same host, shallow pages first", () => {
  const locs = sitemapLocs("<urlset><url><loc>https://x.test/</loc></url><url><loc><![CDATA[https://x.test/services/visa/kitas]]></loc></url><url><loc> https://x.test/about </loc></url><url><loc>https://other.test/a</loc></url><url><loc>https://x.test/file.pdf</loc></url></urlset>");
  assert.equal(locs.length, 5);
  assert.deepEqual(samplePages("https://x.test/", locs, "x.test"), ["https://x.test/", "https://x.test/about", "https://x.test/services/visa/kitas"]);
  assert.equal(samplePages("https://x.test/", locs, "x.test", 2).length, 2);
  assert.equal(isPublicHost("ilaglobalconsulting.com"), true);
  for (const bad of ["localhost", "127.0.0.1", "10.0.0.5", "intranet.local", "db.internal", "[::1]", "x"]) assert.equal(isPublicHost(bad), false, bad);
});

test("buildChecks: blocked crawlers, firewall refusals, empty pages and missing schema are flagged with a fix", () => {
  const page = (url: string, over: Partial<VisibilityAuditPage> = {}): VisibilityAuditPage => ({ url, status: 200, ms: 400, title: "T", description: "D", h1: "H", noindex: false, words: 600, schemaTypes: ["Organization"], ...over });
  const home = page("https://x.test/");
  const good = buildChecks({ home, robots: parseRobots("User-agent: *\nAllow: /"), bots: [{ agent: "GPTBot", owner: "", allowed: true, httpStatus: 200 }], llmsTxt: true, sitemapUrls: 12, pages: [home, page("https://x.test/a", { schemaTypes: ["Article"] })] });
  assert.deepEqual(good.filter((c) => c.status !== "pass"), []);
  assert.equal(scoreOf(good), 100);
  assert.ok(good.every((c) => c.fix === undefined), "a passing check carries no fix");

  const shell = page("https://x.test/", { words: 12, schemaTypes: [], description: undefined });
  const bad = buildChecks({ home: shell, robots: parseRobots("User-agent: GPTBot\nDisallow: /"), bots: [{ agent: "GPTBot", owner: "", allowed: false, httpStatus: 200 }, { agent: "ClaudeBot", owner: "", allowed: true, httpStatus: 403 }], llmsTxt: false, sitemapUrls: 0, pages: [shell, page("https://x.test/gone", { status: 404 })] });
  const status = Object.fromEntries(bad.map((c) => [c.id, c.status]));
  assert.deepEqual(status, { home: "pass", robots: "fail", firewall: "fail", sitemap: "warn", llms: "warn", content: "fail", schema: "fail", meta: "warn", noindex: "pass", speed: "pass", links: "warn" });
  assert.match(bad.find((c) => c.id === "firewall")!.detail, /ClaudeBot \(HTTP 403\)/);
  assert.ok(bad.filter((c) => c.status !== "pass").every((c) => c.fix), "every finding says what to do");
  assert.ok(scoreOf(bad) < 50);
  assert.equal(buildChecks({ home: null, robots: null, bots: [], llmsTxt: false, sitemapUrls: 0, pages: [] }).find((c) => c.id === "home")!.status, "fail");
});

test("renderMarkdown: structure rendered, HTML escaped, only http links", () => {
  const html = renderMarkdown("# Title\n\nA **bold** claim with a [source](https://oss.go.id/a?x=1&y=2) and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n| Item | Fee |\n|---|---|\n| Deed | IDR 5m |\n\n<script>alert(1)</script> [bad](javascript:alert(1))");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/oss\.go\.id\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer nofollow">source<\/a>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<table><thead><tr><th>Item<\/th><th>Fee<\/th><\/tr><\/thead><tbody><tr><td>Deed<\/td><td>IDR 5m<\/td><\/tr><\/tbody><\/table>/);
  assert.ok(!html.includes("<script>"), "raw HTML is escaped");
  assert.ok(!/href="javascript/i.test(html), "a javascript: link stays text");
});

test("parseArticle: title, meta description and body, research notes before the title dropped", () => {
  const a = parseArticle("I'll search first.\n\n# How much does a PT cost in 2026?\nMeta: Costs of a PT PMA in 2026.\n\nA PT PMA costs…\n\n\n\n## Fees", "fallback question");
  assert.equal(a.title, "How much does a PT cost in 2026?");
  assert.equal(a.metaDescription, "Costs of a PT PMA in 2026.");
  assert.equal(a.markdown, "# How much does a PT cost in 2026?\n\nA PT PMA costs…\n\n## Fees");
  assert.equal(parseArticle("No heading at all.", "fallback question").title, "fallback question");
});
