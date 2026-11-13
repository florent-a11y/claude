import { can, requireTeam } from "@/lib/auth";
import { AI_ENGINES, AI_ENGINE_LABELS } from "@/lib/types";
import { CLAUDE_MODEL } from "@/lib/visibility/claude";
import { ENGINE_KEYS, configuredEngines, getConfig } from "@/lib/visibility/config";
import { Badge, Card, Field, Notice, Page, TableCard } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { saveSettings } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · AI visibility" };

const WHERE: Record<(typeof AI_ENGINES)[number], string> = {
  chatgpt: "platform.openai.com → API keys", claude: "console.anthropic.com → API keys", gemini: "aistudio.google.com → Get API key", perplexity: "perplexity.ai → Settings → API",
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const { msg } = await searchParams;
  const config = await getConfig();
  const on = configuredEngines();
  const models: Record<(typeof AI_ENGINES)[number], string> = {
    chatgpt: process.env.VISIBILITY_OPENAI_MODEL || "gpt-5.1", claude: CLAUDE_MODEL, gemini: process.env.VISIBILITY_GEMINI_MODEL || "gemini-2.5-flash", perplexity: process.env.VISIBILITY_PERPLEXITY_MODEL || "sonar",
  };
  return (
    <Page title="Settings" subtitle="The brand to look for, and the assistants that are asked.">
      {msg && <div className="mb-3"><Notice tone="blue">{msg}</Notice></div>}
      <Card title="Brand">
        <form action={saveSettings} className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand name"><input name="brandName" className="input" defaultValue={config.brandName} required maxLength={120} disabled={!write} /></Field>
          <Field label="Domains" hint="Comma-separated, without https://. The first one is the site the technical audit crawls."><input name="domains" className="input" defaultValue={config.domains.join(", ")} required disabled={!write} /></Field>
          <Field label="Other spellings" hint="Comma-separated. Avoid short words that mean something else: a bare “ILA” would match unrelated answers." className="sm:col-span-2"><input name="brandAliases" className="input" defaultValue={config.brandAliases.join(", ")} disabled={!write} /></Field>
          <Field label="What the company does" hint="Used when Claude suggests prompts and drafts articles." className="sm:col-span-2"><textarea name="description" className="input" rows={3} defaultValue={config.description} maxLength={1500} disabled={!write} /></Field>
          {write && <div><SubmitButton>Save</SubmitButton></div>}
        </form>
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Assistants</h2>
      <TableCard>
        <table className="table table-data min-w-[760px]">
          <thead><tr><th style={{ width: 130 }}>Assistant</th><th style={{ width: 130 }}>Status</th><th style={{ width: 210 }}>Environment variable</th><th style={{ width: 170 }}>Model asked</th><th>Where to get the key</th></tr></thead>
          <tbody>{AI_ENGINES.map((e) => (
            <tr key={e}>
              <td className="font-medium">{AI_ENGINE_LABELS[e]}</td>
              <td>{on.includes(e) ? <Badge tone="green">connected</Badge> : <Badge>no key</Badge>}</td>
              <td className="font-mono text-xs">{ENGINE_KEYS[e]}</td>
              <td className="font-mono text-xs">{models[e]}</td>
              <td className="text-xs text-ink-500">{WHERE[e]}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableCard>
      <div className="mt-3 space-y-2 text-xs text-ink-500">
        <p>Keys are set in the hosting environment (Vercel → Project → Settings → Environment Variables), never in this app, then the project is redeployed. Each assistant is asked through its provider&apos;s API with web search switched on. Answers through the API are close to, but not identical to, what a person sees in the consumer app: treat the figures as a trend, not as an exact count.</p>
        <p>Each provider bills the calls to the key&apos;s account. One run asks every tracked prompt once per connected assistant; Claude is also used to rate tone when ILA is named, to suggest prompts and to draft articles.</p>
        <p>Schedule: a run starts every Monday at 02:00 Bali time (Sunday 18:00 UTC) when CRON_SECRET is set, and can be started by hand from the overview at any time.</p>
        <p>Google AI Overviews are not tracked: Google offers no API for them.</p>
      </div>
    </Page>
  );
}
