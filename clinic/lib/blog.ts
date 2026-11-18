import { z } from "zod";
import { LOCALE_CODES } from "./schema";

/**
 * A blog article. One Post is one article in ONE language; translations of the same article share a
 * `translationKey`, which is how search engines are told "this is the Russian version of that page".
 */
export interface Post {
  id: string;
  locale: (typeof LOCALE_CODES)[number];
  /** Last part of the address: /blog/<slug>. Unique within a language. */
  slug: string;
  translationKey: string;
  title: string;
  /** One or two sentences for search results and link previews (aim for 120 to 160 characters). */
  excerpt: string;
  /** "Key takeaways": short, self-contained statements shown at the top. Search engines and AI assistants quote these. */
  takeaways: string[];
  /** The article, written in Markdown. */
  body: string;
  /** Name of a photograph from the library (lib/photos.ts), or "". */
  cover: string;
  tags: string[];
  author: string;
  /** Doctor who checked the article, with credentials ("Dr … , MD"). Leave empty until a real doctor has reviewed it. */
  reviewer: string;
  sources: Array<{ title: string; url: string }>;
  faq: Array<{ q: string; a: string }>;
  /** Product slugs shown under the article. */
  related: string[];
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  /** Set when first published. A date in the future schedules the article. */
  publishedAt?: string;
}

const line = (max: number) => z.string().trim().max(max);

/** What the editor sends. Lists arrive as plain text and are parsed with the helpers below. */
export const postInputSchema = z.object({
  id: z.string().max(60).optional(),
  locale: z.enum(LOCALE_CODES),
  slug: line(90),
  translationKey: line(90),
  title: line(140).min(3),
  excerpt: line(320),
  takeaways: z.string().max(2000),
  body: z.string().max(60_000),
  cover: line(60),
  tags: line(300),
  author: line(120),
  reviewer: line(160),
  sources: z.string().max(6000),
  faq: z.string().max(12_000),
  related: z.array(line(60)).max(6),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().max(40).optional(),
});
export type PostInput = z.infer<typeof postInputSchema>;

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Address-safe version of a title: "Капельницы на Бали: что они дают" becomes "kapelnitsy-na-bali-chto-oni-dayut". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => CYRILLIC[ch] ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // é -> e
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Anchor for a heading inside an article. Keeps letters of any alphabet so Russian headings get readable anchors. */
export function headingId(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "section";
}

/** Markdown without its markup: for descriptions, feeds and word counts. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(markdown: string): number {
  const text = plainText(markdown);
  return text ? text.split(" ").length : 0;
}

/** Reading time at about 200 words a minute, never less than one minute. */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(wordCount(markdown) / 200));
}

/** The second-level headings of an article, for its table of contents. */
export function tableOfContents(markdown: string): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  let fenced = false;
  for (const raw of markdown.split("\n")) {
    if (/^\s*```/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(raw);
    if (m) { const text = plainText(m[1]); out.push({ id: headingId(text), text }); }
  }
  return out;
}

/** One line per item, empty lines dropped. */
export function parseLines(text: string, max = 12): string[] {
  return text.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean).slice(0, max);
}

/** Sources are typed one per line as "Title | https://address". Lines without a web address are ignored. */
export function parseSources(text: string): Post["sources"] {
  const out: Post["sources"] = [];
  for (const raw of text.split("\n")) {
    const i = raw.lastIndexOf("|");
    const title = (i >= 0 ? raw.slice(0, i) : "").trim();
    const url = (i >= 0 ? raw.slice(i + 1) : raw).trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) continue;
    out.push({ title: (title || url).slice(0, 200), url: url.slice(0, 500) });
    if (out.length >= 20) break;
  }
  return out;
}
export const formatSources = (sources: Post["sources"]) => sources.map((s) => `${s.title} | ${s.url}`).join("\n");

/** Questions are typed as "Q: …" followed by "A: …" (the answer may run over several lines). */
export function parseFaq(text: string): Post["faq"] {
  const out: Post["faq"] = [];
  let q = "";
  let a: string[] = [];
  const flush = () => { if (q && a.join(" ").trim()) out.push({ q: q.slice(0, 300), a: a.join(" ").trim().slice(0, 1500) }); q = ""; a = []; };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    const mq = /^(?:q|в|question)\s*[:.]\s*(.+)$/i.exec(l);
    const ma = /^(?:a|о|r|answer|réponse)\s*[:.]\s*(.*)$/i.exec(l);
    if (mq) { flush(); q = mq[1].trim(); }
    else if (ma && q) a.push(ma[1].trim());
    else if (l && q && a.length) a.push(l);
  }
  flush();
  return out.slice(0, 12);
}
export const formatFaq = (faq: Post["faq"]) => faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");

export const parseTags = (text: string) => [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 8);

/** True when the article can be seen by the public right now. */
export function isLive(post: Post, now = new Date()): boolean {
  return post.status === "published" && Boolean(post.publishedAt) && new Date(post.publishedAt!).getTime() <= now.getTime();
}

export interface Check { ok: boolean; label: string }

/** The writing checklist shown beside the editor: what helps an article rank and be quoted by AI assistants. */
export function writingChecks(p: Pick<Post, "title" | "excerpt" | "takeaways" | "body" | "cover" | "sources" | "faq" | "reviewer">): Check[] {
  const words = wordCount(p.body);
  const h2 = tableOfContents(p.body).length;
  return [
    { ok: p.title.length >= 20 && p.title.length <= 65, label: `Title between 20 and 65 characters (now ${p.title.length})` },
    { ok: p.excerpt.length >= 110 && p.excerpt.length <= 165, label: `Summary between 110 and 165 characters (now ${p.excerpt.length})` },
    { ok: p.takeaways.length >= 3, label: `At least 3 key takeaways, each a complete sentence (now ${p.takeaways.length})` },
    { ok: words >= 400, label: `At least 400 words; a full guide usually runs 600 to 1,200 (now ${words})` },
    { ok: h2 >= 3, label: `At least 3 section headings, ideally phrased as questions (now ${h2})` },
    { ok: p.sources.length >= 2, label: `At least 2 sources with links (now ${p.sources.length})` },
    { ok: p.faq.length >= 2, label: `At least 2 questions and answers (now ${p.faq.length})` },
    { ok: Boolean(p.cover), label: "A cover photograph" },
    { ok: Boolean(p.reviewer.trim()), label: "Reviewed by a named doctor" },
  ];
}
