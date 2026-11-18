import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { headingId, isLive, parseFaq, parseLines, parseSources, parseTags, plainText, readingMinutes, slugify, tableOfContents, wordCount, writingChecks, type Post } from "../lib/blog";
import { samplePosts } from "../lib/blog-seed";
import { postMarkdown } from "../lib/blog-markdown";
import { getProduct } from "../lib/catalog";

test("titles become clean addresses in all three languages", () => {
  assert.equal(slugify("IV drips in Bali: what they can and cannot do"), "iv-drips-in-bali-what-they-can-and-cannot-do");
  assert.equal(slugify("Капельницы на Бали: что они дают"), "kapelnitsy-na-bali-chto-oni-dayut");
  assert.equal(slugify("Perfusions à Bali : ce qu’elles font"), "perfusions-a-bali-ce-quelles-font");
  assert.equal(slugify("  --  "), "");
  assert.ok(slugify("x".repeat(200)).length <= 80);
});

test("heading anchors keep letters of any alphabet", () => {
  assert.equal(headingId("What is in an IV drip?"), "what-is-in-an-iv-drip");
  assert.equal(headingId("Что входит в капельницу?"), "что-входит-в-капельницу");
  assert.equal(headingId("???"), "section");
});

test("the table of contents lists second-level headings only, ignoring code blocks", () => {
  const md = "# Title\n\n## First **bold** one\n\ntext\n\n### Sub\n\n```\n## not a heading\n```\n\n## Second [link](https://x.y)\n";
  assert.deepEqual(tableOfContents(md), [{ id: "first-bold-one", text: "First bold one" }, { id: "second-link", text: "Second link" }]);
});

test("plain text and word counts ignore the markup", () => {
  assert.equal(plainText("## Hello\n\n- **one** [two](https://x.y)\n\n| a | b |"), "Hello one two a b");
  assert.equal(wordCount("one two\n\nthree"), 3);
  assert.equal(readingMinutes("word ".repeat(50)), 1);
  assert.equal(readingMinutes("word ".repeat(900)), 5);
});

test("sources need a real web address; the title is optional", () => {
  assert.deepEqual(parseSources("CDC | https://www.cdc.gov/x\nno link here\nhttps://example.org/y\nBad | javascript:alert(1)"), [
    { title: "CDC", url: "https://www.cdc.gov/x" },
    { title: "https://example.org/y", url: "https://example.org/y" },
  ]);
});

test("questions and answers are read in the three languages, with answers over several lines", () => {
  const faq = parseFaq("Q: How long?\nA: About an hour.\nSometimes more.\n\nВ: Сколько?\nО: Час.\n\nQuestion: Combien ?\nRéponse: Une heure.\n\nQ: No answer");
  assert.deepEqual(faq, [{ q: "How long?", a: "About an hour. Sometimes more." }, { q: "Сколько?", a: "Час." }, { q: "Combien ?", a: "Une heure." }]);
});

test("lists and topics are tidied", () => {
  assert.deepEqual(parseLines("- one\n\n* two\n  three  "), ["one", "two", "three"]);
  assert.deepEqual(parseTags("Peptides, Recovery, , Peptides"), ["Peptides", "Recovery"]);
});

test("an article is live only when published and its date has come", () => {
  const base = { status: "published", publishedAt: "2026-11-10T00:00:00.000Z" } as Post;
  assert.equal(isLive(base, new Date("2026-11-18T00:00:00Z")), true);
  assert.equal(isLive({ ...base, publishedAt: "2026-12-01T00:00:00.000Z" }, new Date("2026-11-18T00:00:00Z")), false);
  assert.equal(isLive({ ...base, status: "draft" }, new Date("2026-11-18T00:00:00Z")), false);
  assert.equal(isLive({ ...base, publishedAt: undefined }, new Date("2026-11-18T00:00:00Z")), false);
});

test("the writing checklist reports what is missing", () => {
  const empty = writingChecks({ title: "", excerpt: "", takeaways: [], body: "", cover: "", sources: [], faq: [], reviewer: "" });
  assert.equal(empty.filter((c) => c.ok).length, 0);
  const sample = samplePosts()[0];
  const checks = writingChecks(sample);
  // Everything except the doctor's review, which the samples deliberately do not have.
  assert.deepEqual(checks.filter((c) => !c.ok).map((c) => c.label), ["Reviewed by a named doctor"]);
});

test("the sample articles are well formed and point at things that exist", () => {
  const photos = readdirSync(path.join(__dirname, "..", "photos")).map((f) => f.replace(/\.jpg$/, ""));
  const posts = samplePosts(new Date("2026-11-18T00:00:00Z"));
  assert.equal(new Set(posts.map((p) => p.id)).size, posts.length);
  assert.equal(new Set(posts.map((p) => `${p.locale}/${p.slug}`)).size, posts.length);
  for (const p of posts) {
    assert.equal(p.slug, slugify(p.slug), `${p.slug} is not a clean address`);
    assert.ok(photos.includes(p.cover), `${p.slug}: cover "${p.cover}" is not in the photo library`);
    for (const slug of p.related) assert.ok(getProduct(slug), `${p.slug}: related product "${slug}" does not exist`);
    for (const s of p.sources) assert.match(s.url, /^https:\/\//);
    assert.ok(p.sources.length >= 2 && p.faq.length >= 2 && p.takeaways.length >= 3);
    assert.equal(p.reviewer, "", "samples must not claim a medical review");
    assert.ok(tableOfContents(p.body).length >= 4);
  }
  // The guide exists in the three languages and they are linked as translations.
  assert.deepEqual(posts.filter((p) => p.translationKey === "iv-drips-guide").map((p) => p.locale).sort(), ["en", "fr", "ru"]);
});

test("the Markdown version of an article carries its facts, questions and sources", () => {
  const md = postMarkdown(samplePosts()[1]);
  assert.match(md, /^# BPC-157 and TB-500/);
  assert.match(md, /## Key takeaways/);
  assert.match(md, /## Questions and answers/);
  assert.match(md, /\[.*HSS Journal.*\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/40756949\/\)/);
  assert.doesNotMatch(md, /Medically reviewed by/);
  assert.doesNotMatch(md, /\n\n\n/);
});
