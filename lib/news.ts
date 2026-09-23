import "server-only";
import Parser from "rss-parser";
import { createHash } from "node:crypto";
import type { NewsItem } from "./store";

/**
 * Official sources. Each is tried as RSS first, then as an HTML listing.
 * Adjust selectors if the ministry sites change their markup.
 */
export const SOURCES: Array<{ source: NewsItem["source"]; label: string; rss?: string; html?: string }> = [
  { source: "imigrasi", label: "Direktorat Jenderal Imigrasi", rss: "https://www.imigrasi.go.id/feed", html: "https://www.imigrasi.go.id/berita" },
  { source: "beacukai", label: "Bea Cukai (Customs)", rss: "https://www.beacukai.go.id/rss", html: "https://www.beacukai.go.id/berita.html" },
];

const KEYWORDS = /(all indonesia|kartu kedatangan|arrival card|kedatangan|visa|voa|bebas visa|bea cukai|customs|pabean|barang bawaan|imei|deklarasi|e-cd|wisatawan|bandara|imigrasi)/i;

function id(url: string) {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "user-agent": "ArrivalCardAssist/1.0 (+news summaries with attribution)" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function fromRss(src: (typeof SOURCES)[number]): Promise<NewsItem[]> {
  if (!src.rss) return [];
  const parser = new Parser({ timeout: 15000 });
  const feed = await parser.parseString(await fetchText(src.rss));
  return (feed.items ?? [])
    .filter((i) => i.link && i.title)
    .map((i) => ({
      id: id(i.link!),
      source: src.source,
      title: i.title!.trim(),
      url: i.link!,
      summary: (i.contentSnippet ?? i.content ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
      publishedAt: i.isoDate ?? new Date().toISOString(),
    }));
}

async function fromHtml(src: (typeof SOURCES)[number]): Promise<NewsItem[]> {
  if (!src.html) return [];
  const html = await fetchText(src.html);
  const base = new URL(src.html);
  const out = new Map<string, NewsItem>();
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text.length < 25 || !KEYWORDS.test(text)) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (u.hostname !== base.hostname) continue;
    const url = u.toString();
    out.set(url, { id: id(url), source: src.source, title: text, url, summary: "", publishedAt: new Date().toISOString() });
  }
  return [...out.values()].slice(0, 15);
}

export async function collectNews(): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  for (const src of SOURCES) {
    let got: NewsItem[] = [];
    try { got = await fromRss(src); } catch { /* fall through */ }
    if (got.length === 0) {
      try { got = await fromHtml(src); } catch { /* skip source */ }
    }
    items.push(...got.filter((i) => KEYWORDS.test(i.title) || KEYWORDS.test(i.summary)));
  }
  return items;
}

/** Optional: produce short English summaries with Claude. Falls back to the raw snippet. */
export async function summarize(items: NewsItem[]): Promise<NewsItem[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || items.length === 0) return items;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const out: NewsItem[] = [];
  for (const item of items) {
    try {
      const msg = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Summarize this Indonesian government announcement for international travelers in 2 plain English sentences. Only state what the text says; do not add advice. Title: ${item.title}\nText: ${item.summary || "(title only)"}`,
        }],
      });
      const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
      out.push({ ...item, summary: text || item.summary });
    } catch {
      out.push(item);
    }
  }
  return out;
}
