import Link from "next/link";
import { can, requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { AI_ENGINES, AI_ENGINE_LABELS } from "@/lib/types";
import { ENGINE_KEYS } from "@/lib/visibility/config";
import { brandRows, fmtPct, promptRows, summarise } from "@/lib/visibility/metrics";
import { Badge, Card, EmptyState, Notice, Page, Stat, TableCard } from "@/components/ui";
import { loadVisibility } from "./_data";
import { Bar, EnginePills } from "./_components/bits";
import { DraftButton, RunButton } from "./_components/Controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI visibility" };

export default async function Overview() {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const v = await loadVisibility();
  const active = v.prompts.filter((p) => p.active);
  const noEngine = v.engines.length === 0;
  const runButton = write && <RunButton open={v.open} disabled={noEngine ? "Add an API key first (Settings)" : active.length === 0 ? "No active prompt" : undefined} />;
  const subtitle = `How often AI assistants name ${v.config.brandName} when prospects ask, and who they name instead.`;

  if (!v.run) {
    return (
      <Page title="AI visibility" subtitle={subtitle} actions={runButton}>
        {noEngine && <Notice>No assistant is connected yet. Add at least one API key in the hosting environment ({AI_ENGINES.map((e) => ENGINE_KEYS[e]).join(", ")}), redeploy, then run. Details in <Link className="underline" href="/visibility/settings">Settings</Link>.</Notice>}
        <div className="mt-4"><EmptyState title="No run yet" hint={`${active.length} prompts are ready to be asked to ${v.engines.length ? v.engines.map((e) => AI_ENGINE_LABELS[e]).join(", ") : "the assistants you connect"}. A run takes a few minutes.`} /></div>
      </Page>
    );
  }

  const s = summarise(v.answers);
  const engines = v.run.engines;
  const asked = v.prompts.filter((p) => v.run!.promptIds.includes(p.id));
  const rows = promptRows(asked, v.answers, v.config);
  const gaps = rows.filter((r) => r.asked > 0 && r.visible === 0);
  const wins = rows.filter((r) => r.visible > 0).sort((a, b) => b.visible - a.visible);
  const brands = brandRows(v.answers, v.config);
  const articles = await db.list("visibility_articles");
  const articleFor = new Map(articles.filter((a) => a.promptId).map((a) => [a.promptId!, a]));
  const history = v.runs.filter((r) => r.status === "done" && r.summary).slice(0, 12);
  const prev = history[1]?.summary;
  const delta = (now: number, before?: number | null) => (before === undefined || before === null ? undefined : `${now >= before ? "+" : ""}${Math.round((now - before) * 100)} pts vs previous run`);
  const missing = AI_ENGINES.filter((e) => !v.engines.includes(e));

  return (
    <Page title="AI visibility" subtitle={subtitle} actions={<>
      {write && s.errors > 0 && !v.open && <RunButton retryRunId={v.run.id} label={`Retry ${s.errors} failed`} />}
      {runButton}
    </>}>
      <p className="mb-3 text-xs text-ink-500">Last run {fmtDateTime(v.run.finishedAt ?? v.run.startedAt)} · {asked.length} prompts × {engines.map((e) => AI_ENGINE_LABELS[e]).join(", ")} · {s.answers} answers{s.errors ? `, ${s.errors} failed` : ""}</p>
      {missing.length > 0 && <div className="mb-4"><Notice tone="blue">Not connected: {missing.map((e) => AI_ENGINE_LABELS[e]).join(", ")}. Add {missing.map((e) => ENGINE_KEYS[e]).join(", ")} to track {missing.length > 1 ? "them" : "it"} (<Link className="underline" href="/visibility/settings">Settings</Link>).</Notice></div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Brand visibility" value={fmtPct(s.visibility)} hint={delta(s.visibility, prev?.visibility) ?? "Share of answers that name ILA or cite its site"} />
        <Stat label="Share of voice" value={fmtPct(s.shareOfVoice)} hint={delta(s.shareOfVoice, prev?.shareOfVoice) ?? "ILA's appearances against tracked competitors'"} />
        <Stat label="Positive sentiment" value={fmtPct(s.positive)} hint={s.positive !== null ? "Of the answers that name ILA" : v.answers.some((a) => a.brandMentioned) ? "Tone is rated by Claude: add ANTHROPIC_API_KEY" : "No answer names ILA yet"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Who the assistants name" className="lg:col-span-2" actions={<Link href="/visibility/competitors" className="text-xs text-brand-600 hover:underline">All competitors</Link>}>
          <div className="space-y-2">
            {brands.slice(0, 6).map((b) => (
              <div key={b.name} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
                <span className={`truncate ${b.isBrand ? "font-semibold text-brand-700" : ""}`} title={b.name}>{b.name}</span>
                <Bar value={b.visibility} tone={b.isBrand ? "bg-accent-500" : "bg-brand-500"} />
                <span className="num text-xs">{fmtPct(b.visibility)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">Share of answers in which each firm appears. Competitors are edited on the Competitors tab; sites cited often but not tracked yet show on Sources.</p>
        </Card>
        <Card title="By assistant">
          <div className="space-y-2">
            {engines.map((e) => { const sum = summarise(v.answers.filter((a) => a.engine === e)); return (
              <div key={e} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 text-sm">
                <span>{AI_ENGINE_LABELS[e]}</span><Bar value={sum.visibility} tone="bg-accent-500" /><span className="num text-xs">{fmtPct(sum.visibility)}</span>
              </div>
            ); })}
          </div>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Where ILA is missing · {gaps.length} of {rows.length} prompts</h2>
      {gaps.length === 0 ? <Notice tone="green">ILA appears for every prompt on at least one assistant.</Notice> : (
        <TableCard>
          <table className="table table-data min-w-[760px]">
            <thead><tr><th>Prompt</th><th style={{ width: 190 }}>Assistants</th><th style={{ width: 210 }}></th></tr></thead>
            <tbody>
              {gaps.map((r) => { const art = articleFor.get(r.prompt.id); return (
                <tr key={r.prompt.id}>
                  <td>
                    <Link href={`/visibility/prompts/${r.prompt.id}`} className="cell-primary" title={r.prompt.text}>{r.prompt.text}</Link>
                    <span className="cell-sub">{r.citedInstead ? <>{r.citedInstead} cited instead</> : "No firm stands out in the answers"}</span>
                  </td>
                  <td><EnginePills statuses={r.engines} engines={engines} /></td>
                  <td className="text-right">{art ? <Link href={`/visibility/articles/${art.id}`} className="text-xs text-brand-600 hover:underline">{art.status === "published" ? "Article published" : "Open draft"}</Link> : write ? <DraftButton promptId={r.prompt.id} label="Write the article" disabled={v.engines.includes("claude") ? undefined : "Needs ANTHROPIC_API_KEY"} /> : null}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </TableCard>
      )}

      {wins.length > 0 && <>
        <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Where ILA appears · {wins.length}</h2>
        <TableCard>
          <table className="table table-data min-w-[620px]">
            <thead><tr><th>Prompt</th><th style={{ width: 190 }}>Assistants</th><th className="num" style={{ width: 90 }}>Visible</th></tr></thead>
            <tbody>{wins.map((r) => (
              <tr key={r.prompt.id}><td><Link href={`/visibility/prompts/${r.prompt.id}`} className="cell-primary" title={r.prompt.text}>{r.prompt.text}</Link></td><td><EnginePills statuses={r.engines} engines={engines} /></td><td className="num text-xs">{r.visible}/{r.asked}</td></tr>
            ))}</tbody>
          </table>
        </TableCard>
      </>}

      {history.length > 1 && <>
        <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Trend</h2>
        <TableCard>
          <table className="table table-data min-w-[620px]">
            <thead><tr><th>Run</th><th className="num">Answers</th><th className="num">Visibility</th><th className="num">Share of voice</th><th className="num">Positive</th></tr></thead>
            <tbody>{history.map((r, i) => (
              <tr key={r.id}><td>{fmtDateTime(r.finishedAt ?? r.startedAt)}{i === 0 && <Badge tone="brand" className="ml-2">latest</Badge>}</td><td className="num">{r.summary!.answers}</td><td className="num">{fmtPct(r.summary!.visibility)}</td><td className="num">{fmtPct(r.summary!.shareOfVoice)}</td><td className="num">{fmtPct(r.summary!.positive)}</td></tr>
            ))}</tbody>
          </table>
        </TableCard>
      </>}
    </Page>
  );
}
