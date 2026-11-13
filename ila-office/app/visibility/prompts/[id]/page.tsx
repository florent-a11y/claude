import { notFound } from "next/navigation";
import { can, requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { AI_ENGINE_LABELS, type VisibilityAnswer } from "@/lib/types";
import { domainIn } from "@/lib/visibility/analyze";
import { getConfig } from "@/lib/visibility/config";
import { renderMarkdown } from "@/lib/visibility/markdown";
import { isVisible, rescore } from "@/lib/visibility/metrics";
import { Badge, Card, EmptyState, Page } from "@/components/ui";
import { Prose } from "../../_components/bits";
import { DraftButton } from "../../_components/Controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prompt · AI visibility" };

export default async function PromptDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const me = await requireTeam();
  const { id } = await params;
  const { run: runParam } = await searchParams;
  const prompt = await db.get("visibility_prompts", id);
  if (!prompt) notFound();
  const [config, all, article] = await Promise.all([getConfig(), db.list("visibility_answers", { where: { promptId: id } }), db.list("visibility_articles", { where: { promptId: id } })]);
  const answers = rescore(all, config);
  // Runs that asked this prompt, newest first (answer timestamps stand in for the run date).
  const byRun = new Map<string, VisibilityAnswer[]>();
  for (const a of answers) { const l = byRun.get(a.runId); if (l) l.push(a); else byRun.set(a.runId, [a]); }
  const runs = [...byRun].map(([runId, list]) => ({ runId, list, at: list.map((a) => a.askedAt).sort()[0] })).sort((a, b) => b.at.localeCompare(a.at));
  const shown = runs.find((r) => r.runId === runParam) ?? runs[0];
  const claudeReady = !!process.env.ANTHROPIC_API_KEY?.trim();

  return (
    <Page title={prompt.text} subtitle={prompt.topic} breadcrumbs={[{ href: "/visibility", label: "AI visibility" }, { href: "/visibility/prompts", label: "Prompts" }, { label: "Answers" }]}
      actions={article[0] ? <a href={`/visibility/articles/${article[0].id}`} className="btn-secondary">Open article</a> : can(me, "crm:write") ? <DraftButton promptId={id} className="btn-primary" label="Write the article" disabled={claudeReady ? undefined : "Needs ANTHROPIC_API_KEY"} /> : null}>
      {!shown ? <EmptyState title="Not asked yet" hint="This prompt is asked on the next run." /> : <>
        {runs.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2 text-xs no-print">
            {runs.slice(0, 10).map((r) => { const good = r.list.filter((a) => !a.error); return (
              <a key={r.runId} href={`?run=${r.runId}`} className={`rounded-full px-3 py-1 ring-1 ring-slate-200 ${r.runId === shown.runId ? "bg-brand-600 text-white" : "bg-white hover:bg-brand-50"}`}>{fmtDateTime(r.at)} · {good.filter(isVisible).length}/{good.length}</a>
            ); })}
          </div>
        )}
        <div className="space-y-4">
          {[...shown.list].sort((a, b) => a.engine.localeCompare(b.engine)).map((a) => (
            <Card key={a.id} title={<span className="flex flex-wrap items-center gap-2">{AI_ENGINE_LABELS[a.engine]}
              {a.error ? <Badge tone="amber">failed</Badge> : a.brandMentioned ? <Badge tone="green">names ILA</Badge> : a.brandCited ? <Badge tone="blue">cites ILA's site</Badge> : <Badge>ILA absent</Badge>}
              {a.sentiment && <Badge tone={a.sentiment === "positive" ? "green" : a.sentiment === "negative" ? "red" : "slate"} title={a.sentimentNote}>{a.sentiment}</Badge>}
              {a.competitors.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}
            </span>} actions={<span className="text-xs text-ink-500">{a.model}</span>}>
              {a.error ? <p className="text-sm text-amber-900">{a.error}</p> : <>
                {a.sentimentNote && <p className="mb-2 text-xs text-ink-500">{a.sentimentNote}</p>}
                <details open={shown.list.length <= 2}>
                  <summary className="cursor-pointer text-xs font-medium text-brand-600">Full answer ({a.text.split(/\s+/).length} words)</summary>
                  <Prose html={renderMarkdown(a.text)} className="mt-2 border-t border-slate-100 pt-2" />
                </details>
                {a.citations.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2">
                    <p className="mb-1 text-xs font-semibold text-ink-700">Sources cited · {a.citations.length}</p>
                    <ul className="space-y-0.5 text-xs">
                      {a.citations.map((c) => { const own = domainIn(c.domain, config.domains); const rival = config.competitors.find((k) => domainIn(c.domain, k.domains)); return (
                        <li key={c.url} className="truncate">
                          <span className={`mr-2 font-medium ${own ? "text-green-700" : rival ? "text-accent-600" : "text-ink-700"}`}>{c.domain}</span>
                          <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-ink-500 hover:underline">{c.title ?? c.url}</a>
                        </li>
                      ); })}
                    </ul>
                  </div>
                )}
              </>}
            </Card>
          ))}
        </div>
      </>}
    </Page>
  );
}
