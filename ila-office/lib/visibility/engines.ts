import type { AiEngine } from "../types";
import { askClaude, claudeError } from "./claude";
import { ENGINE_KEYS } from "./config";

/**
 * One question to one assistant, with that assistant's own web search switched on, the way a prospect uses it. Returns
 * the answer text and the pages it cites. Claude goes through the Anthropic SDK (lib/visibility/claude.ts); the other
 * three are plain HTTPS calls to their public APIs. Models can be changed per engine with the VISIBILITY_*_MODEL
 * environment variables when a provider retires one.
 */

export interface EngineAnswer { text: string; model: string; citations: Array<{ url: string; title?: string | null; domain?: string }> }

const MODELS = {
  chatgpt: () => process.env.VISIBILITY_OPENAI_MODEL?.trim() || "gpt-5.1",
  gemini: () => process.env.VISIBILITY_GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  perplexity: () => process.env.VISIBILITY_PERPLEXITY_MODEL?.trim() || "sonar",
};

async function postJson(label: string, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(`${label}: ${e instanceof Error && e.name === "TimeoutError" ? "timed out" : "could not reach the API"}`);
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try { const j = JSON.parse(text) as { error?: { message?: string } | string }; detail = (typeof j.error === "string" ? j.error : j.error?.message) ?? detail; } catch { /* not JSON */ }
    throw new Error(`${label}: HTTP ${res.status} ${detail}`.trim());
  }
  try { return JSON.parse(text); } catch { throw new Error(`${label}: unreadable response`); }
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

/** OpenAI Responses API with the built-in web search tool. Citations are `url_citation` annotations on the text. */
export function parseOpenAI(data: unknown): Omit<EngineAnswer, "model"> {
  let text = "";
  const citations: EngineAnswer["citations"] = [];
  for (const item of arr((data as Json)?.output)) {
    if (item.type !== "message") continue;
    for (const part of arr(item.content)) {
      if (part.type !== "output_text") continue;
      text += s(part.text);
      for (const a of arr(part.annotations)) if (a.type === "url_citation" && s(a.url)) citations.push({ url: s(a.url), title: s(a.title) || undefined });
    }
  }
  return { text, citations };
}

/**
 * Gemini with Google Search grounding. Each source is a redirect link on a Google host whose `title` is the real site's
 * domain, so the domain is taken from the title.
 */
export function parseGemini(data: unknown): Omit<EngineAnswer, "model"> {
  const cand = arr((data as Json)?.candidates)[0];
  const text = arr((cand?.content as Json)?.parts).map((p) => s(p.text)).join("");
  const citations: EngineAnswer["citations"] = [];
  for (const chunk of arr((cand?.groundingMetadata as Json)?.groundingChunks)) {
    const web = chunk.web as Json | undefined;
    if (!web || !s(web.uri)) continue;
    const title = s(web.title);
    citations.push({ url: s(web.uri), title: title || undefined, domain: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title) ? title : undefined });
  }
  return { text, citations };
}

/** Perplexity Sonar: `search_results` (title + url) on current versions, a bare `citations` URL list on older ones. */
export function parsePerplexity(data: unknown): Omit<EngineAnswer, "model"> {
  const d = data as Json;
  const text = s((arr(d?.choices)[0]?.message as Json)?.content);
  const results = arr(d?.search_results).filter((r) => s(r.url)).map((r) => ({ url: s(r.url), title: s(r.title) || undefined }));
  const urls = Array.isArray(d?.citations) ? (d.citations as unknown[]).filter((u): u is string => typeof u === "string").map((url) => ({ url })) : [];
  return { text, citations: results.length ? results : urls };
}

export async function askEngine(engine: AiEngine, prompt: string, timeoutMs = 110_000): Promise<EngineAnswer> {
  const key = process.env[ENGINE_KEYS[engine]]?.trim();
  if (!key) throw new Error(`${ENGINE_KEYS[engine]} is not set`);
  let out: EngineAnswer;
  if (engine === "claude") {
    try { out = await askClaude(prompt, timeoutMs); } catch (e) { throw new Error(claudeError(e)); }
  } else if (engine === "chatgpt") {
    const model = MODELS.chatgpt();
    const data = await postJson("ChatGPT", "https://api.openai.com/v1/responses", { authorization: `Bearer ${key}` }, { model, input: prompt, tools: [{ type: "web_search" }] }, timeoutMs);
    out = { ...parseOpenAI(data), model };
  } else if (engine === "gemini") {
    const model = MODELS.gemini();
    const data = await postJson("Gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }, timeoutMs);
    out = { ...parseGemini(data), model };
  } else {
    const model = MODELS.perplexity();
    const data = await postJson("Perplexity", "https://api.perplexity.ai/chat/completions", { authorization: `Bearer ${key}` }, { model, messages: [{ role: "user", content: prompt }] }, timeoutMs);
    out = { ...parsePerplexity(data), model };
  }
  if (!out.text.trim()) throw new Error(`${engine}: empty answer`);
  return out;
}
