import { AI_ENGINES, type AiEngine, type VisibilityAnswer, type VisibilityConfig, type VisibilityPrompt, type VisibilityRunSummary } from "../types";
import { domainIn, scoreAnswer } from "./analyze";

/** Figures shown by the visibility pages, all computed from stored answers. Pure: no I/O. */

export const isVisible = (a: VisibilityAnswer) => a.brandMentioned || a.brandCited;
const ok = (answers: readonly VisibilityAnswer[]) => answers.filter((a) => !a.error);
const pct = (n: number, d: number) => (d > 0 ? n / d : 0);

/** Applies the current brand and competitor lists to stored answers (they were scored with the lists of their day). */
export function rescore(answers: readonly VisibilityAnswer[], config: VisibilityConfig): VisibilityAnswer[] {
  return answers.map((a) => (a.error ? a : { ...a, ...scoreAnswer(a.text, a.citations, config) }));
}

/**
 * - visibility: share of answers that name ILA or cite its site.
 * - share of voice: ILA's appearances over ILA's plus every tracked competitor's appearances.
 * - positive: share of the answers naming ILA whose tone about ILA is positive (null when ILA is never named).
 */
export function summarise(answers: readonly VisibilityAnswer[]): VisibilityRunSummary {
  const good = ok(answers);
  const brand = good.filter(isVisible).length;
  const rivals = good.reduce((n, a) => n + a.competitors.length, 0);
  const rated = good.filter((a) => a.sentiment);
  return {
    answers: good.length,
    errors: answers.length - good.length,
    visibility: pct(brand, good.length),
    shareOfVoice: pct(brand, brand + rivals),
    positive: rated.length ? pct(rated.filter((a) => a.sentiment === "positive").length, rated.length) : null,
  };
}

export type EngineStatus = "mentioned" | "cited" | "absent" | "error" | "none";
export interface PromptRow {
  prompt: VisibilityPrompt;
  engines: Record<AiEngine, EngineStatus>;
  /** Engines with an answer, and how many of them show ILA. */
  asked: number; visible: number;
  /** Who the assistants put forward when ILA is missing: the most frequent competitor, else the most cited outside site. */
  citedInstead?: string;
}

export function promptRows(prompts: readonly VisibilityPrompt[], answers: readonly VisibilityAnswer[], config: VisibilityConfig): PromptRow[] {
  const byPrompt = new Map<string, VisibilityAnswer[]>();
  for (const a of answers) { const l = byPrompt.get(a.promptId); if (l) l.push(a); else byPrompt.set(a.promptId, [a]); }
  return prompts.map((prompt) => {
    const mine = byPrompt.get(prompt.id) ?? [];
    const engines = Object.fromEntries(AI_ENGINES.map((e) => [e, "none"])) as Record<AiEngine, EngineStatus>;
    for (const a of mine) engines[a.engine] = a.error ? "error" : a.brandMentioned ? "mentioned" : a.brandCited ? "cited" : "absent";
    const good = ok(mine);
    return { prompt, engines, asked: good.length, visible: good.filter(isVisible).length, citedInstead: citedInstead(good, config) };
  });
}

function top(counts: Map<string, number>): string | undefined {
  let best: string | undefined; let n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

export function citedInstead(answers: readonly VisibilityAnswer[], config: VisibilityConfig): string | undefined {
  const rivals = new Map<string, number>();
  const sites = new Map<string, number>();
  for (const a of answers) {
    if (isVisible(a)) continue;
    // Earlier in the answer weighs more: the first name is the one a reader remembers.
    a.competitors.forEach((c, i) => rivals.set(c, (rivals.get(c) ?? 0) + 1 / (i + 1)));
    for (const d of new Set(a.citations.map((c) => c.domain))) if (!domainIn(d, config.domains)) sites.set(d, (sites.get(d) ?? 0) + 1);
  }
  return top(rivals) ?? top(sites);
}

export interface BrandRow { name: string; isBrand: boolean; appearances: number; visibility: number; shareOfVoice: number; byEngine: Partial<Record<AiEngine, number>> }

/** ILA next to every tracked competitor, most visible first. */
export function brandRows(answers: readonly VisibilityAnswer[], config: VisibilityConfig): BrandRow[] {
  const good = ok(answers);
  const engines = AI_ENGINES.filter((e) => good.some((a) => a.engine === e));
  const has = (a: VisibilityAnswer, name: string | null) => (name === null ? isVisible(a) : a.competitors.includes(name));
  const names: Array<string | null> = [null, ...config.competitors.map((c) => c.name)];
  const counts = names.map((n) => good.filter((a) => has(a, n)).length);
  const total = counts.reduce((x, y) => x + y, 0);
  return names.map((n, i) => ({
    name: n ?? config.brandName, isBrand: n === null, appearances: counts[i],
    visibility: pct(counts[i], good.length), shareOfVoice: pct(counts[i], total),
    byEngine: Object.fromEntries(engines.map((e) => { const of = good.filter((a) => a.engine === e); return [e, pct(of.filter((a) => has(a, n)).length, of.length)]; })),
  })).sort((a, b) => b.appearances - a.appearances || Number(b.isBrand) - Number(a.isBrand));
}

export interface SourceRow {
  domain: string; kind: "own" | "competitor" | "other"; competitor?: string;
  /** Answers citing the domain, and how many different prompts those answers cover. */
  answers: number; prompts: number;
  pages: Array<{ url: string; title?: string; answers: number }>;
}

/** The sites the assistants lean on, most cited first. */
export function sourceRows(answers: readonly VisibilityAnswer[], config: VisibilityConfig): SourceRow[] {
  const map = new Map<string, { answers: Set<string>; prompts: Set<string>; pages: Map<string, { title?: string; answers: Set<string> }> }>();
  for (const a of ok(answers)) for (const c of a.citations) {
    let row = map.get(c.domain);
    if (!row) map.set(c.domain, (row = { answers: new Set(), prompts: new Set(), pages: new Map() }));
    row.answers.add(a.id); row.prompts.add(a.promptId);
    let page = row.pages.get(c.url);
    if (!page) row.pages.set(c.url, (page = { title: c.title, answers: new Set() }));
    page.answers.add(a.id);
  }
  return [...map].map(([domain, r]): SourceRow => {
    const rival = config.competitors.find((c) => domainIn(domain, c.domains));
    return {
      domain, kind: domainIn(domain, config.domains) ? "own" : rival ? "competitor" : "other", competitor: rival?.name,
      answers: r.answers.size, prompts: r.prompts.size,
      pages: [...r.pages].map(([url, p]) => ({ url, title: p.title, answers: p.answers.size })).sort((x, y) => y.answers - x.answers),
    };
  }).sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain));
}

export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`);
