import { can, requireTeam } from "@/lib/auth";
import { AI_ENGINE_LABELS } from "@/lib/types";
import { brandRows, fmtPct } from "@/lib/visibility/metrics";
import { Badge, Card, EmptyState, Field, Notice, Page, TableCard } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { loadVisibility } from "../_data";
import { Bar } from "../_components/bits";
import { addCompetitor, removeCompetitor } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Competitors · AI visibility" };

export default async function Competitors({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const { msg } = await searchParams;
  const v = await loadVisibility();
  const rows = brandRows(v.answers, v.config);
  const engines = v.run?.engines ?? [];
  const info = new Map(v.config.competitors.map((c) => [c.name, c]));
  return (
    <Page title="Competitors" subtitle="Who the assistants put forward for the tracked prompts. A firm counts when an answer names it or cites its site.">
      {msg && <div className="mb-3"><Notice tone="blue">{msg}</Notice></div>}
      {!v.run ? <EmptyState title="No run yet" hint="Figures appear after the first run. The competitor list below is already used for scoring." /> : (
        <TableCard>
          <table className="table table-data min-w-[860px]">
            <thead><tr><th>Firm</th><th style={{ width: 220 }}>Visibility</th><th className="num" style={{ width: 110 }}>Share of voice</th>{engines.map((e) => <th key={e} className="num" style={{ width: 90 }}>{AI_ENGINE_LABELS[e]}</th>)}{write && <th style={{ width: 80 }}></th>}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.name} className={r.isBrand ? "row-highlight" : ""}>
                <td><span className="cell-primary">{r.name}{r.isBrand && <Badge tone="brand" className="ml-2">you</Badge>}</span><span className="cell-sub">{r.isBrand ? v.config.domains.join(", ") : info.get(r.name)?.domains.join(", ") || "no domain set"}</span></td>
                <td><span className="flex items-center gap-2"><Bar value={r.visibility} tone={r.isBrand ? "bg-accent-500" : "bg-brand-500"} /><span className="num w-10 text-xs">{fmtPct(r.visibility)}</span></span></td>
                <td className="num">{fmtPct(r.shareOfVoice)}</td>
                {engines.map((e) => <td key={e} className="num text-xs">{fmtPct(r.byEngine[e])}</td>)}
                {write && <td className="text-right text-xs">{!r.isBrand && <ConfirmForm action={removeCompetitor.bind(null, r.name)} message={`Stop tracking ${r.name}?`}><button className="text-red-700 hover:underline">Remove</button></ConfirmForm>}</td>}
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
      )}
      {write && (
        <Card title="Track a competitor" className="mt-4">
          <form action={addCompetitor} className="grid items-end gap-3 sm:grid-cols-[12rem_1fr_1fr_auto]">
            <Field label="Name"><input name="name" className="input" required maxLength={80} placeholder="Emerhub" /></Field>
            <Field label="Other spellings" hint="Comma-separated"><input name="aliases" className="input" placeholder="InCorp, InCorp Indonesia" /></Field>
            <Field label="Domains" hint="Comma-separated"><input name="domains" className="input" placeholder="emerhub.com" /></Field>
            <SubmitButton>Add</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-ink-500">Adding or removing a firm re-scores stored answers at once: no new run is needed. Saving a name that exists replaces its spellings and domains.</p>
        </Card>
      )}
    </Page>
  );
}
