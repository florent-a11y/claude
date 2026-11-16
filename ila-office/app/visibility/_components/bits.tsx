import { AI_ENGINE_LABELS, type AiEngine } from "@/lib/types";
import type { EngineStatus } from "@/lib/visibility/metrics";

const STYLE: Record<EngineStatus, string> = {
  mentioned: "bg-green-100 text-green-800 ring-green-300",
  cited: "bg-blue-100 text-blue-800 ring-blue-300",
  absent: "bg-white text-slate-400 ring-slate-200 line-through",
  error: "bg-amber-50 text-amber-800 ring-amber-300",
  none: "bg-white text-slate-300 ring-slate-100",
};
const WORD: Record<EngineStatus, string> = { mentioned: "names ILA", cited: "cites ILA's site without naming it", absent: "ILA absent", error: "the call failed", none: "not asked" };
const SHORT: Record<AiEngine, string> = { chatgpt: "GPT", claude: "Claude", gemini: "Gemini", perplexity: "Pplx" };

/** One small pill per assistant: green when it names ILA, blue when it only cites the site, struck through when ILA is absent. */
export function EnginePills({ statuses, engines }: { statuses: Record<AiEngine, EngineStatus>; engines: readonly AiEngine[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {engines.map((e) => <span key={e} title={`${AI_ENGINE_LABELS[e]}: ${WORD[statuses[e]]}`} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${STYLE[statuses[e]]}`}>{SHORT[e]}</span>)}
    </span>
  );
}

/** Horizontal bar for a 0..1 share. */
export function Bar({ value, tone = "bg-brand-500" }: { value: number; tone?: string }) {
  return <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></span>;
}

/** Model- or assistant-written text rendered from Markdown (escaped by lib/visibility/markdown.ts). */
export function Prose({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`prose-ila ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
