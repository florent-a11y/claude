import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../content/en";
import { id } from "../content/id";
import { fill, plain } from "../content";
import { allPosts } from "../lib/blog";
import { HERO_CHAT } from "../lib/hero-chat";
import { QUESTIONS } from "../lib/quiz";
import { SECTORS, SECTOR_IDS, sectorByAnySlug, sectorBySlug } from "../lib/sectors";

/** Structure of a value: object keys and array lengths, without the text itself. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, shape(v)]));
  return typeof value;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

test("Indonesian and English have the same keys and the same list lengths", () => {
  assert.deepEqual(shape(id), shape(en));
});

test("no text is left empty in either language", () => {
  for (const text of [...strings(en), ...strings(id)]) assert.ok(text.trim().length > 0);
});

test("placeholders match between languages", () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  const enStrings = strings(en);
  const idStrings = strings(id);
  enStrings.forEach((text, index) => assert.deepEqual(placeholders(idStrings[index]), placeholders(text), text));
});

test("fill replaces known placeholders and leaves unknown ones", () => {
  assert.equal(fill("Question {n} of {total}", { n: 2, total: 10 }), "Question 2 of 10");
  assert.equal(fill("Hello {name}", {}), "Hello {name}");
});

test("every quiz question and option has a label", () => {
  for (const question of QUESTIONS) {
    const copy = en.quiz.questions[question.id] as { q: string; options: Record<string, string> };
    assert.deepEqual(Object.keys(copy.options).sort(), [...question.options].sort(), question.id);
  }
});

test("sector slugs are unique and resolve in both languages", () => {
  const slugs = SECTOR_IDS.flatMap((sector) => Object.values(SECTORS[sector].slug));
  assert.equal(new Set(slugs).size, slugs.length);
  for (const sector of SECTOR_IDS) {
    assert.equal(sectorBySlug(SECTORS[sector].slug.en, "en"), sector);
    assert.equal(sectorBySlug(SECTORS[sector].slug.id, "id"), sector);
    assert.equal(sectorBySlug(SECTORS[sector].slug.en, "id"), undefined);
    assert.equal(sectorByAnySlug(SECTORS[sector].slug.en), sector);
  }
});

test("every blog article exists in both languages, with unique slugs", () => {
  const posts = allPosts();
  assert.ok(posts.length >= 2);
  const keys = new Set(posts.map((post) => post.key));
  for (const key of keys) {
    assert.deepEqual(posts.filter((post) => post.key === key).map((post) => post.locale).sort(), ["en", "id"], key);
  }
  assert.equal(new Set(posts.map((post) => post.slug)).size, posts.length);
  for (const post of posts) assert.ok(post.html.includes("<h2"), post.slug);
});

test("the hero conversation alternates guest and assistant and confirms before staff are notified", () => {
  const note = HERO_CHAT.findIndex((message) => message.from === "note");
  assert.ok(note > 0 && HERO_CHAT[note - 1].from === "assistant");
  const spoken = HERO_CHAT.filter((message) => message.from !== "note");
  spoken.forEach((message, index) => assert.equal(message.from, index % 2 === 0 ? "guest" : "assistant"));
});

test("accent markers in headings come in pairs, in both languages", () => {
  for (const text of [...strings(en), ...strings(id)]) {
    const stars = (text.match(/\*/g) ?? []).length;
    assert.equal(stars % 2, 0, text);
    // A highlighted phrase is never empty.
    assert.equal(/\*\s*\*/.test(text), false, text);
  }
  assert.equal(plain("AI that fits the way your business *really works*"), "AI that fits the way your business really works");
});

test("text used as plain page titles and descriptions carries no accent markers", () => {
  for (const dict of [en, id]) {
    const plainOnly = [dict.meta.title, dict.meta.description, ...Object.values(dict.sectors.items).flatMap((item) => [item.title, item.name, item.intro])];
    for (const key of ["services", "process", "sectors", "pricing", "about", "contact", "quiz", "demo", "blog", "privacy"] as const) {
      plainOnly.push(dict[key].metaTitle, dict[key].metaDescription);
    }
    for (const text of plainOnly) assert.equal(text.includes("*"), false, text);
  }
});
