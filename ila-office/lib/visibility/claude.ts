import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { VisibilityConfig } from "../types";

/**
 * Everything the visibility module asks of Claude: answering a buyer prompt with web search (as one of the tracked
 * assistants), rating the tone of an answer about ILA, suggesting prompts, and drafting articles.
 *
 * Requests carry server-side refusal fallbacks so a declined request is re-run on another model inside the same call.
 */

export const CLAUDE_MODEL = process.env.VISIBILITY_CLAUDE_MODEL?.trim() || "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** The fallback parameter exists on the current model families only; an older model set through the env var goes without. */
const fallback = /^claude-(opus-5|sonnet-5-5|fable-5|mythos-5)/.test(CLAUDE_MODEL) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};
const WEB_SEARCH = { type: "web_search_20260209" as const, name: "web_search" as const };

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY is not set");
  return (client ??= new Anthropic({ maxRetries: 1 }));
}

export function claudeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Claude: the API key was rejected";
  if (e instanceof Anthropic.RateLimitError) return "Claude: rate limited, try again later";
  if (e instanceof Anthropic.APIConnectionError) return "Claude: could not reach the API";
  if (e instanceof Anthropic.APIError) return `Claude: API error ${e.status ?? ""} ${e.message}`.trim();
  return e instanceof Error ? e.message : String(e);
}

type Raw = { text: string; citations: Array<{ url: string; title?: string | null }> };

/** Text and cited pages of a response; server tools that paused are resumed by sending the turn back (a few times at most). */
async function collect(send: (messages: Anthropic.Beta.BetaMessageParam[]) => Promise<Anthropic.Beta.BetaMessage>, prompt: string): Promise<Raw> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const out: Raw = { text: "", citations: [] };
  for (let turn = 0; turn < 4; turn++) {
    const res = await send(messages);
    for (const block of res.content) {
      if (block.type !== "text") continue;
      out.text += block.text;
      for (const c of block.citations ?? []) if (c.type === "web_search_result_location") out.citations.push({ url: c.url, title: c.title });
    }
    if (res.stop_reason === "refusal") throw new Error("Claude declined to answer");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return out;
}

/** A buyer question, asked the way a person would in the Claude app: no system prompt, web search available. */
export async function askClaude(prompt: string, timeoutMs: number): Promise<Raw & { model: string }> {
  const r = await collect((messages) => anthropic().beta.messages.create(
    { model: CLAUDE_MODEL, max_tokens: 8000, ...fallback, tools: [{ ...WEB_SEARCH, max_uses: 4 }], messages },
    { timeout: timeoutMs },
  ), prompt);
  return { ...r, model: CLAUDE_MODEL };
}

const Sentiment = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  note: z.string().describe("One short sentence: how the answer presents the company."),
});

/** How an answer speaks of ILA. Null when Claude is not configured or the rating fails: the answer is still stored. */
export async function rateSentiment(config: VisibilityConfig, question: string, answer: string): Promise<z.infer<typeof Sentiment> | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  try {
    const res = await anthropic().beta.messages.parse({
      model: CLAUDE_MODEL, max_tokens: 2000, ...fallback,
      output_config: { effort: "low", format: betaZodOutputFormat(Sentiment) },
      system: `You rate how an AI assistant's answer presents one company, "${config.brandName}" (also written: ${config.brandAliases.join(", ") || "no other spelling"}). positive: recommended, praised or listed as a good option. negative: criticised or advised against. neutral: named without a judgement. Rate only what the answer says about this company.`,
      messages: [{ role: "user", content: `Question asked:\n${question}\n\nAnswer given:\n${answer.slice(0, 12000)}` }],
    }, { timeout: 60_000 });
    return res.parsed_output ?? null;
  } catch {
    return null;
  }
}

const Suggestions = z.object({ prompts: z.array(z.object({ text: z.string(), topic: z.string() })) });

/** New buyer questions to track, written the way people type them into an assistant. */
export async function suggestPrompts(config: VisibilityConfig, existing: string[], count = 10): Promise<Array<{ text: string; topic: string }>> {
  const res = await anthropic().beta.messages.parse({
    model: CLAUDE_MODEL, max_tokens: 6000, ...fallback,
    output_config: { effort: "low", format: betaZodOutputFormat(Suggestions) },
    system: "You help a consultancy track how AI assistants answer its prospects. You write the questions real prospects type into ChatGPT, Claude, Gemini or Perplexity before they hire such a firm: specific, in their own words, lower case as people type, mostly without naming any firm. Mix questions about a problem (costs, rules, deadlines, how-to) with questions that ask for a provider (best agent, who can do X). Topic is a one or two word service line.",
    messages: [{ role: "user", content: `Company: ${config.brandName}\nWhat it does: ${config.description}\n\nAlready tracked, do not repeat or rephrase these:\n${existing.map((t) => `- ${t}`).join("\n") || "(none)"}\n\nWrite ${count} new questions.` }],
  }, { timeout: 90_000 });
  const seen = new Set(existing.map((t) => t.trim().toLowerCase()));
  return (res.parsed_output?.prompts ?? []).filter((p) => p.text.trim() && !seen.has(p.text.trim().toLowerCase())).slice(0, count);
}

export interface ArticleDraft { title: string; metaDescription?: string; markdown: string; citations: Raw["citations"] }

const ARTICLE_SYSTEM = (config: VisibilityConfig) => `You write for the website of ${config.brandName} (${config.domains[0] ?? ""}). ${config.description}

You are drafting an article that answers one question prospects ask AI assistants, so that assistants can quote it and cite the site. Assistants quote pages that state the answer plainly, give exact figures with their legal basis and date, and are organised so one passage answers one question.

Research first with web search and prefer primary sources: Indonesian government sites (BKPM / OSS, Directorate General of Taxes, Immigration, ATR/BPN), the regulations themselves, then reputable law and accounting firms. Every figure, threshold, fee, rate and deadline must come from a source you opened in this session; name the regulation (number and year) where there is one. When sources disagree or a rule is changing, say so. Never invent a figure: write that it varies and what it depends on instead.

Write the article in Markdown:
- First line: "# " and a title that is the question in plain words.
- Second line: "Meta: " and a description of 150 characters or fewer.
- Then a two to four sentence direct answer to the question, with the key figure.
- Then sections with "## " headings phrased as the follow-up questions a reader has. Use a table where figures are compared, numbered steps for a procedure.
- A "## Frequently asked questions" section with four to six short question and answer pairs.
- End with one short paragraph on how ${config.brandName} helps with this, factual and without superlatives.

Write for a foreign founder or resident who is not a lawyer: plain sentences, Indonesian terms explained on first use, amounts in IDR with an approximate USD figure. Do not name or link competing service firms in the text. 900 to 1,400 words. State the month and year the information was checked.`;

/** A sourced article draft answering `question`. Long request (research + writing): streamed, a few minutes. */
export async function draftArticle(config: VisibilityConfig, question: string, competitorPages: string[], timeoutMs: number): Promise<ArticleDraft> {
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const prompt = `Question to answer: ${question}\n\nToday is ${month}.${competitorPages.length ? `\n\nAssistants currently cite these pages for this question. Read what they cover so the article is at least as complete, but verify their figures against primary sources:\n${competitorPages.map((u) => `- ${u}`).join("\n")}` : ""}`;
  const r = await collect((messages) => anthropic().beta.messages.stream(
    { model: CLAUDE_MODEL, max_tokens: 32000, ...fallback, output_config: { effort: "high" }, system: ARTICLE_SYSTEM(config), tools: [{ ...WEB_SEARCH, max_uses: 12 }], messages },
    { timeout: timeoutMs },
  ).finalMessage(), prompt);
  return { ...parseArticle(r.text, question), citations: r.citations };
}

/** Splits the model's Markdown into title, meta description and body. Text before the title (research notes) is dropped. */
export function parseArticle(text: string, question: string): { title: string; metaDescription?: string; markdown: string } {
  const start = text.search(/^# \S/m);
  let body = (start >= 0 ? text.slice(start) : text).trim();
  const title = /^# (.+)$/m.exec(body)?.[1].trim() ?? question;
  const meta = /^Meta:\s*(.+)$/im.exec(body)?.[1].trim();
  body = body.replace(/^Meta:.*\n?/im, "").replace(/\n{3,}/g, "\n\n").trim();
  return { title, metaDescription: meta, markdown: body };
}
