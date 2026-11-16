import type { VisibilityCitation, VisibilityCompetitor, VisibilityConfig } from "../types";

/**
 * Reads one assistant answer: is ILA named, is ILA's site cited, which competitors appear. Pure functions, no I/O, so the
 * same rules score a fresh answer (lib/visibility/run.ts) and re-score stored answers after the brand or competitor list
 * changes (lib/visibility/metrics.ts `rescore`).
 */

/** "https://www.Emerhub.com/x" → "emerhub.com". Empty string when the value is not a URL or host. */
export function hostOf(urlOrHost: string): string {
  const raw = urlOrHost.trim();
  if (!raw) return "";
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

/** True when `domain` is one of `list` or a subdomain of one ("blog.emerhub.com" matches "emerhub.com"). */
export function domainIn(domain: string, list: readonly string[]): boolean {
  const d = hostOf(domain);
  if (!d) return false;
  return list.some((x) => { const h = hostOf(x); return !!h && (d === h || d.endsWith(`.${h}`)); });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Position of the first whole-word, case-insensitive occurrence of any name, or -1. Whole word so that "ILA" does not
 * match "Manila"; spaces in a name match any whitespace so a line break inside "ILA Global" still counts.
 */
export function firstMention(text: string, names: readonly string[]): number {
  let best = -1;
  for (const name of names) {
    const n = name.trim();
    if (n.length < 2) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu");
    const m = re.exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

export const namesOf = (c: VisibilityCompetitor) => [c.name, ...(c.aliases ?? [])];

/** Removes duplicates and tracking parameters, and fills in the domain. `fallbackDomain` covers redirect links (Gemini). */
export function toCitations(raw: Array<{ url: string; title?: string | null; domain?: string }>): VisibilityCitation[] {
  const seen = new Set<string>();
  const out: VisibilityCitation[] = [];
  for (const r of raw) {
    if (!r?.url) continue;
    let url = r.url.trim();
    try {
      const u = new URL(url);
      for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|srsltid)/i.test(k)) u.searchParams.delete(k);
      u.hash = "";
      url = u.toString();
    } catch { continue; }
    const domain = (r.domain && hostOf(r.domain)) || hostOf(url);
    if (!domain) continue;
    const key = `${domain}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, title: r.title?.trim() || undefined, domain });
  }
  return out;
}

export interface AnswerScore { brandMentioned: boolean; brandCited: boolean; competitors: string[] }

export function scoreAnswer(text: string, citations: readonly VisibilityCitation[], config: VisibilityConfig): AnswerScore {
  // A bare domain in the text ("see ilaglobalconsulting.com") is a mention too.
  const brandNames = [config.brandName, ...config.brandAliases, ...config.domains];
  const found: Array<{ name: string; at: number }> = [];
  for (const c of config.competitors) {
    const inText = firstMention(text, [...namesOf(c), ...c.domains]);
    const cited = citations.some((x) => domainIn(x.domain, c.domains));
    if (inText >= 0 || cited) found.push({ name: c.name, at: inText >= 0 ? inText : Number.MAX_SAFE_INTEGER });
  }
  found.sort((a, b) => a.at - b.at);
  return {
    brandMentioned: firstMention(text, brandNames) >= 0,
    brandCited: citations.some((x) => domainIn(x.domain, config.domains)),
    competitors: found.map((f) => f.name),
  };
}
