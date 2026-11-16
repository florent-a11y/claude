import { can, requireTeam } from "@/lib/auth";
import { sourceRows } from "@/lib/visibility/metrics";
import { Badge, EmptyState, Notice, Page, TableCard } from "@/components/ui";
import { loadVisibility } from "../_data";
import { addCompetitor } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources · AI visibility" };

export default async function Sources({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const { msg } = await searchParams;
  const v = await loadVisibility();
  const rows = sourceRows(v.answers, v.config);
  const total = v.answers.filter((a) => !a.error).length;
  const own = rows.filter((r) => r.kind === "own").reduce((n, r) => n + r.answers, 0);
  return (
    <Page title="Sources" subtitle="The sites the assistants cite for the tracked prompts. These are the pages to match, to be quoted on, or to get listed in.">
      {msg && <div className="mb-3"><Notice tone="blue">{msg}</Notice></div>}
      {rows.length === 0 ? <EmptyState title="No cited source yet" hint="Sources appear after a run in which the assistants search the web." /> : <>
        <p className="mb-3 text-xs text-ink-500">{rows.length} sites cited across {total} answers · ILA's own site cited in {own}.</p>
        <TableCard>
          <table className="table table-data min-w-[900px]">
            <thead><tr><th style={{ width: 260 }}>Site</th><th className="num" style={{ width: 90 }}>Answers</th><th className="num" style={{ width: 90 }}>Prompts</th><th>Most cited pages</th>{write && <th style={{ width: 150 }}></th>}</tr></thead>
            <tbody>{rows.slice(0, 80).map((r) => (
              <tr key={r.domain} className={r.kind === "own" ? "row-highlight" : ""}>
                <td><span className="cell-primary">{r.domain}{r.kind === "own" && <Badge tone="green" className="ml-2">you</Badge>}{r.kind === "competitor" && <Badge tone="accent" className="ml-2">{r.competitor}</Badge>}</span></td>
                <td className="num">{r.answers}</td>
                <td className="num">{r.prompts}</td>
                <td>{r.pages.slice(0, 3).map((p) => <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="cell text-xs text-ink-700 hover:underline" title={p.url}>{p.answers > 1 && <span className="mr-1 text-ink-500">{p.answers}×</span>}{p.title ?? p.url}</a>)}</td>
                {write && <td className="text-right text-xs">{r.kind === "other" && (
                  <form action={addCompetitor}><input type="hidden" name="domains" value={r.domain} /><input type="hidden" name="back" value="sources" /><button className="text-brand-600 hover:underline" title="Use for firms that sell the same services, not for government or news sites">Track as competitor</button></form>
                )}</td>}
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
        {rows.length > 80 && <p className="mt-2 text-xs text-ink-500">Showing the 80 most cited of {rows.length} sites.</p>}
      </>}
    </Page>
  );
}
