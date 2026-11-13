import Link from "next/link";
import { can, requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { promptRows } from "@/lib/visibility/metrics";
import { Badge, Card, EmptyState, Notice, Page, TableCard } from "@/components/ui";
import { loadVisibility } from "../_data";
import { DraftButton } from "../_components/Controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Articles · AI visibility" };

export default async function Articles() {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const [v, articles] = await Promise.all([loadVisibility(), db.list("visibility_articles", { orderBy: "createdAt", desc: true })]);
  const written = new Set(articles.map((a) => a.promptId).filter(Boolean));
  const todo = promptRows(v.prompts.filter((p) => p.active), v.answers, v.config).filter((r) => r.asked > 0 && r.visible === 0 && !written.has(r.prompt.id));
  const claudeOff = v.engines.includes("claude") ? undefined : "Needs ANTHROPIC_API_KEY";
  return (
    <Page title="Articles" subtitle="Drafts that answer the questions where ILA is missing, written to be quoted by AI assistants. Every draft is checked by a consultant before it is published.">
      {claudeOff && <div className="mb-3"><Notice>Drafting uses Claude: add ANTHROPIC_API_KEY to the hosting environment.</Notice></div>}
      {articles.length === 0 ? <EmptyState title="No article yet" hint={todo.length ? "Start from one of the questions below." : "After a run, the questions where ILA is missing are listed here."} /> : (
        <TableCard>
          <table className="table table-data min-w-[760px]">
            <thead><tr><th>Article</th><th style={{ width: 120 }}>Status</th><th style={{ width: 120 }}>Drafted</th><th className="num" style={{ width: 90 }}>Words</th></tr></thead>
            <tbody>{articles.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/visibility/articles/${a.id}`} className="cell-primary" title={a.title}>{a.title}</Link><span className="cell-sub" title={a.question}>Answers: {a.question}</span></td>
                <td>{a.status === "published" ? <Badge tone="green">published</Badge> : <Badge>draft</Badge>}</td>
                <td className="text-xs">{fmtDate(a.createdAt.slice(0, 10))}</td>
                <td className="num text-xs">{a.markdown.split(/\s+/).length}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
      )}
      {todo.length > 0 && (
        <Card title={`Questions without an article · ${todo.length}`} className="mt-4">
          <ul className="divide-y divide-slate-100">
            {todo.map((r) => (
              <li key={r.prompt.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0"><span className="block font-medium">{r.prompt.text}</span>{r.citedInstead && <span className="text-xs text-ink-500">{r.citedInstead} cited instead</span>}</span>
                {write && <DraftButton promptId={r.prompt.id} label="Write the article" disabled={claudeOff} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
