import Link from "next/link";
import { can, requireTeam } from "@/lib/auth";
import { fmtPct, promptRows, type PromptRow } from "@/lib/visibility/metrics";
import { Badge, Card, Field, Notice, Page, TableCard } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { loadVisibility } from "../_data";
import { EnginePills } from "../_components/bits";
import { addPrompt, deletePrompt, setPromptActive, suggestMorePrompts } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prompts · AI visibility" };
/** "Suggest prompts" waits for Claude. */
export const maxDuration = 120;

export default async function Prompts({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const { msg } = await searchParams;
  const v = await loadVisibility();
  const engines = v.run?.engines ?? v.engines;
  const rows = promptRows(v.prompts, v.answers, v.config);
  const tracked = rows.filter((r) => r.prompt.active);
  const off = rows.filter((r) => !r.prompt.active);
  const table = (list: PromptRow[], activeList: boolean) => (
    <TableCard>
      <table className="table table-data min-w-[860px]">
        <thead><tr><th>Prompt</th><th style={{ width: 130 }}>Topic</th><th style={{ width: 190 }}>Assistants</th><th className="num" style={{ width: 80 }}>Visible</th><th style={{ width: 170 }}>Cited instead</th>{write && <th style={{ width: 130 }}></th>}</tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.prompt.id} className={activeList ? "" : "row-muted"}>
            <td><Link href={`/visibility/prompts/${r.prompt.id}`} className="cell-primary" title={r.prompt.text}>{r.prompt.text}</Link></td>
            <td><span className="cell text-xs">{r.prompt.topic ?? "–"}</span></td>
            <td>{r.asked > 0 || Object.values(r.engines).some((s) => s === "error") ? <EnginePills statuses={r.engines} engines={engines} /> : <span className="text-xs text-ink-500">not asked yet</span>}</td>
            <td className="num text-xs">{r.asked > 0 ? <>{r.visible}/{r.asked} <span className="text-ink-500">({fmtPct(r.visible / r.asked)})</span></> : "–"}</td>
            <td><span className="cell text-xs" title={r.citedInstead}>{r.asked > 0 && r.visible < r.asked ? r.citedInstead ?? "–" : "–"}</span></td>
            {write && <td className="whitespace-nowrap text-right text-xs">
              <form action={setPromptActive.bind(null, r.prompt.id, !activeList)} className="inline"><button className="text-brand-600 hover:underline">{activeList ? "Pause" : "Track"}</button></form>
              <ConfirmForm action={deletePrompt.bind(null, r.prompt.id)} message="Delete this prompt and its stored answers?" className="ml-3 inline"><button className="text-red-700 hover:underline">Delete</button></ConfirmForm>
            </td>}
          </tr>
        ))}</tbody>
      </table>
    </TableCard>
  );
  return (
    <Page title="Prompts" subtitle={`The questions asked on every run, as a prospect would type them. ${tracked.length} tracked.`}
      actions={write && <form action={suggestMorePrompts}><SubmitButton className="btn-secondary" pendingText="Asking Claude…">Suggest prompts</SubmitButton></form>}>
      {msg && <div className="mb-3"><Notice tone="blue">{msg}</Notice></div>}
      {write && (
        <Card className="mb-4">
          <form action={addPrompt} className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <Field label="New prompt"><input name="text" className="input" required minLength={8} maxLength={300} placeholder="e.g. best visa agent in Bali for a retirement KITAS" /></Field>
            <Field label="Topic (optional)"><input name="topic" className="input" maxLength={40} placeholder="Visas" /></Field>
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      )}
      {table(tracked, true)}
      {off.length > 0 && <>
        <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Not tracked · {off.length} <Badge className="ml-1">suggestions and paused prompts</Badge></h2>
        {table(off, false)}
      </>}
    </Page>
  );
}
