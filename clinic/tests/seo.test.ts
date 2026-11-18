import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_CRAWLERS, DEFAULT_SEO, DESCRIPTION_RANGE, SEO_PAGES, TITLE_RANGE, auditSite, effectiveText, lengthStatus, normalizeSeo, verificationCode, type AuditInput, type SeoSettings } from "../lib/seo-settings";
import { samplePosts } from "../lib/blog-seed";
import { PRODUCTS } from "../lib/catalog";
import { builtInText, editablePages } from "../lib/seo-defaults";

const status = (items: ReturnType<typeof auditSite>, id: string) => items.find((i) => i.id === id)?.status;
const goodTitle = "IV drips in Bali, at your villa | Vitanadi";
const goodDescription = "Nurse-administered IV drips at our lounge or brought to your villa in Bali, reviewed by a doctor first. Order online and pay after approval.";
const base = (over: Partial<AuditInput> = {}): AuditInput => ({
  demo: false, siteUrl: "https://vitanadi.com", settings: DEFAULT_SEO, posts: [],
  pages: SEO_PAGES.map((p) => ({ path: p.path, label: p.label, locale: "en" as const, title: goodTitle, description: goodDescription })),
  business: { whatsapp: "6281200000000", address: "Jl. Example 1, Canggu", company: "PT Example" },
  now: new Date("2026-12-01T00:00:00Z"), ...over,
});

test("the crawler list has no duplicates and names both kinds", () => {
  const agents = AI_CRAWLERS.map((c) => c.agent);
  assert.equal(new Set(agents).size, agents.length);
  assert.ok(AI_CRAWLERS.some((c) => c.use === "search") && AI_CRAWLERS.some((c) => c.use === "training"));
  for (const a of agents) assert.match(a, /^[A-Za-z0-9-]+$/, `${a} must be safe to print in robots.txt`);
});

test("stored settings are tidied: unknown crawlers, bad keys and empty text are dropped", () => {
  const s = normalizeSeo({
    pages: { "/": { en: { title: "  My title  ", description: "" }, de: { title: "Nein" }, ru: { title: "", description: "" } }, "no-slash": { en: { title: "x" } } },
    blockedCrawlers: ["GPTBot", "GPTBot", "Googlebot", 7],
    llmsFacts: ["  A fact. ", "", 3, "x".repeat(500)],
    verification: { google: '<meta name="google-site-verification" content="abc_DEF-123" />', bing: "  0123ABCD  ", yandex: "<script>alert(1)</script>" },
    indexNowKey: "NOT-A-KEY",
    updatedBy: "ops:ops",
  });
  assert.deepEqual(s.pages, { "/": { en: { title: "My title" } } });
  assert.deepEqual(s.blockedCrawlers, ["GPTBot"]);
  assert.equal(s.llmsFacts.length, 2);
  assert.equal(s.llmsFacts[0], "A fact.");
  assert.equal(s.llmsFacts[1].length, 400);
  assert.deepEqual(s.verification, { google: "abc_DEF-123", bing: "0123ABCD", yandex: "scriptalert1script" });
  assert.equal(s.indexNowKey, "");
  assert.equal(s.updatedBy, "ops:ops");
  assert.deepEqual(normalizeSeo(null), DEFAULT_SEO);
  assert.deepEqual(normalizeSeo("nonsense"), DEFAULT_SEO);
  assert.equal(normalizeSeo({ indexNowKey: "0123456789abcdef0123456789abcdef" }).indexNowKey, "0123456789abcdef0123456789abcdef");
});

test("a pasted verification tag is reduced to its code, and can never carry markup", () => {
  assert.equal(verificationCode('<meta name="msvalidate.01" content="A1B2C3" />'), "A1B2C3");
  assert.equal(verificationCode("<meta name='yandex-verification' content='0a1b2c' />"), "0a1b2c");
  assert.equal(verificationCode("plainCode_9"), "plainCode_9");
  assert.equal(verificationCode('"><script>'), "script");
  assert.equal(verificationCode(undefined), "");
});

test("a page uses your wording where you wrote some, the built-in wording elsewhere", () => {
  const settings: SeoSettings = { ...DEFAULT_SEO, pages: { "/peptides": { fr: { title: "Peptides à Bali" } } } };
  const builtIn = { title: "Built-in title", description: "Built-in description" };
  assert.deepEqual(effectiveText(settings, "/peptides", "fr", builtIn), { title: "Peptides à Bali", description: "Built-in description", titleEdited: true, descriptionEdited: false });
  assert.deepEqual(effectiveText(settings, "/peptides", "en", builtIn), { ...builtIn, titleEdited: false, descriptionEdited: false });
});

test("lengths are judged against what search engines show", () => {
  assert.equal(lengthStatus("", TITLE_RANGE), "empty");
  assert.equal(lengthStatus("Short", TITLE_RANGE), "short");
  assert.equal(lengthStatus(goodTitle, TITLE_RANGE), "good");
  assert.equal(lengthStatus("x".repeat(66), TITLE_RANGE), "long");
  assert.equal(lengthStatus(goodDescription, DESCRIPTION_RANGE), "good");
});

test("the health check blocks on a test site and warns on a temporary address", () => {
  const demo = auditSite(base({ demo: true, siteUrl: "https://vitanadi.vercel.app" }));
  assert.equal(status(demo, "visible"), "fail");
  assert.equal(status(demo, "domain"), "warn");
  const live = auditSite(base());
  assert.equal(status(live, "visible"), "pass");
  assert.equal(status(live, "domain"), "pass");
  assert.equal(status(live, "titles"), "pass");
  assert.equal(status(live, "descriptions"), "pass");
  assert.equal(status(live, "business"), "pass");
  assert.ok(live.every((i) => i.status === "pass" || i.fix), "every warning says what to do");
  assert.ok(live.filter((i) => i.status === "pass").every((i) => !i.fix));
});

test("refusing an AI search crawler is a warning; refusing only training crawlers is not", () => {
  assert.equal(status(auditSite(base({ settings: { ...DEFAULT_SEO, blockedCrawlers: ["GPTBot", "CCBot"] } })), "crawlers"), "pass");
  const warned = auditSite(base({ settings: { ...DEFAULT_SEO, blockedCrawlers: ["OAI-SearchBot"] } }));
  assert.equal(status(warned, "crawlers"), "warn");
  assert.match(warned.find((i) => i.id === "crawlers")!.detail, /OAI-SearchBot/);
});

test("the health check reads the articles: languages, doctor review, sources", () => {
  assert.equal(status(auditSite(base()), "articles"), "warn");
  assert.equal(status(auditSite(base()), "reviewed"), undefined, "no article, nothing to review");
  const samples = samplePosts();
  const withSamples = auditSite(base({ posts: samples }));
  assert.equal(status(withSamples, "articles"), "pass");
  assert.equal(status(withSamples, "reviewed"), "warn", "the samples name no doctor");
  assert.equal(status(withSamples, "citable"), "pass");
  const reviewed = auditSite(base({ posts: samples.map((p) => ({ ...p, reviewer: "dr. Example, GP" })) }));
  assert.equal(status(reviewed, "reviewed"), "pass");
  const englishOnly = auditSite(base({ posts: samples.filter((p) => p.locale === "en") }));
  assert.equal(status(englishOnly, "articles"), "warn");
  assert.match(englishOnly.find((i) => i.id === "articles")!.detail, /RU, FR/);
});

test("missing business details, search consoles and IndexNow are reported", () => {
  const bare = auditSite(base({ business: { whatsapp: "", address: "", company: "" } }));
  assert.equal(status(bare, "business"), "warn");
  assert.equal(status(bare, "consoles"), "warn");
  assert.equal(status(bare, "indexnow"), "warn");
  const set = auditSite(base({ settings: { ...DEFAULT_SEO, verification: { google: "abc", bing: "", yandex: "" }, indexNowKey: "0123456789abcdef0123456789abcdef" } }));
  assert.equal(status(set, "consoles"), "pass");
  assert.equal(status(set, "indexnow"), "pass");
});

test("every editable page and product has built-in wording of a good length in the three languages", () => {
  const values = { brand: "Vitanadi", opens: "08:00", closes: "20:00" };
  const pages = editablePages().flatMap((g) => g.pages);
  assert.equal(pages.length, SEO_PAGES.length + PRODUCTS.length);
  for (const locale of ["en", "ru", "fr"] as const) {
    for (const page of pages) {
      const text = builtInText(locale, page.path, values);
      assert.ok(text, `${locale} ${page.path} needs built-in wording`);
      assert.equal(lengthStatus(text.title, TITLE_RANGE), "good", `${locale} ${page.path} title (${text.title.length}): ${text.title}`);
      assert.equal(lengthStatus(text.description, DESCRIPTION_RANGE), "good", `${locale} ${page.path} description (${text.description.length}): ${text.description}`);
      assert.doesNotMatch(text.title + text.description, /[{}]/, `${locale} ${page.path} has an unfilled placeholder`);
    }
  }
  assert.equal(builtInText("en", "/checkout", values), null);
  assert.equal(builtInText("en", "/treatments/does-not-exist", values), null);
});

test("with the built-in wording alone, the titles and descriptions checks pass", () => {
  const values = { brand: "Vitanadi", opens: "08:00", closes: "20:00" };
  const pages = SEO_PAGES.flatMap((p) => (["en", "ru", "fr"] as const).map((locale) => ({ path: p.path, label: p.label, locale, ...builtInText(locale, p.path, values)! })));
  const items = auditSite(base({ pages }));
  assert.equal(status(items, "titles"), "pass");
  assert.equal(status(items, "descriptions"), "pass");
});
