import { can, requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { getConfig } from "@/lib/visibility/config";
import { Badge, Card, EmptyState, Page, Stat, TableCard, type Tone } from "@/components/ui";
import { AuditButton } from "../_components/Controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Technical audit · AI visibility" };

const TONE: Record<"pass" | "warn" | "fail", Tone> = { pass: "green", warn: "amber", fail: "red" };
const WORD = { pass: "OK", warn: "Improve", fail: "Fix" };

export default async function Audit() {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const [config, audits] = await Promise.all([getConfig(), db.list("visibility_audits", { orderBy: "createdAt", desc: true, limit: 6 })]);
  const audit = audits[0];
  const subtitle = `Can AI crawlers reach ${config.domains[0]} and read it? robots.txt, firewall, sitemap, llms.txt, structured data and content checked on a sample of pages.`;
  if (!audit) return <Page title="Technical audit" subtitle={subtitle} actions={write && <AuditButton />}><EmptyState title="No audit yet" hint="The audit fetches the public site the way an AI crawler does. It takes about a minute." /></Page>;
  const order = { fail: 0, warn: 1, pass: 2 };
  const checks = [...audit.checks].sort((a, b) => order[a.status] - order[b.status]);
  const count = (s: "pass" | "warn" | "fail") => audit.checks.filter((c) => c.status === s).length;
  const prev = audits[1];
  return (
    <Page title="Technical audit" subtitle={subtitle} actions={write && <AuditButton label="Run again" />}>
      <p className="mb-3 text-xs text-ink-500">{audit.domain} · crawled {fmtDateTime(audit.createdAt)} · {audit.pages.length} pages sampled</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="AI readiness" value={`${audit.score}/100`} hint={prev ? `${audit.score >= prev.score ? "+" : ""}${audit.score - prev.score} since ${fmtDateTime(prev.createdAt)}` : undefined} tone={audit.score >= 80 ? "text-green-700" : audit.score >= 50 ? "text-amber-700" : "text-red-700"} />
        <Stat label="To fix" value={count("fail")} tone={count("fail") ? "text-red-700" : ""} />
        <Stat label="To improve" value={count("warn")} tone={count("warn") ? "text-amber-700" : ""} />
        <Stat label="Passing" value={count("pass")} />
      </div>

      <div className="mt-4 space-y-3">
        {checks.map((c) => (
          <Card key={c.id} className="!p-4">
            <div className="flex flex-wrap items-start gap-3">
              <Badge tone={TONE[c.status]} className="mt-0.5">{WORD[c.status]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="mt-0.5 text-sm text-ink-700 [overflow-wrap:anywhere]">{c.detail}</p>
                {c.fix && <p className="mt-1 text-sm text-ink-500"><span className="font-medium text-ink-700">What to do:</span> {c.fix}</p>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">AI crawlers</h2>
      <TableCard>
        <table className="table table-data min-w-[620px]">
          <thead><tr><th>Crawler</th><th>Feeds</th><th style={{ width: 130 }}>robots.txt</th><th style={{ width: 150 }}>Server answer</th></tr></thead>
          <tbody>{audit.bots.map((b) => (
            <tr key={b.agent}>
              <td className="font-mono text-xs">{b.agent}</td><td className="text-xs">{b.owner}</td>
              <td>{b.allowed ? <Badge tone="green">allowed</Badge> : <Badge tone="red">blocked</Badge>}</td>
              <td className="text-xs">{b.httpStatus === undefined ? <span className="text-ink-500">not probed</span> : b.httpStatus === 200 ? <Badge tone="green">HTTP 200</Badge> : <Badge tone="red">HTTP {b.httpStatus}</Badge>}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableCard>
      <p className="mt-2 text-xs text-ink-500">The server answer is what the site returns to a request carrying the crawler's user agent from our server. A firewall that verifies crawler IP addresses can treat the real crawler differently.</p>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">Pages sampled</h2>
      <TableCard>
        <table className="table table-data min-w-[900px]">
          <thead><tr><th>Page</th><th className="num" style={{ width: 70 }}>HTTP</th><th className="num" style={{ width: 80 }}>Time</th><th className="num" style={{ width: 80 }}>Words</th><th style={{ width: 240 }}>Structured data</th><th style={{ width: 150 }}>Missing</th></tr></thead>
          <tbody>{audit.pages.map((p) => { const missing = [!p.title && "title", !p.description && "description", !p.h1 && "h1", p.noindex && "noindex set"].filter(Boolean) as string[]; return (
            <tr key={p.url}>
              <td><a href={p.url} target="_blank" rel="noopener noreferrer" className="cell-primary" title={p.url}>{new URL(p.url).pathname}</a><span className="cell-sub" title={p.title}>{p.title ?? p.error ?? "no title"}</span></td>
              <td className="num text-xs">{p.status || "–"}</td><td className="num text-xs">{p.ms} ms</td>
              <td className={`num text-xs ${p.status === 200 && p.words < 150 ? "font-semibold text-red-700" : ""}`}>{p.words}</td>
              <td><span className="cell text-xs" title={p.schemaTypes.join(", ")}>{p.schemaTypes.join(", ") || <span className="text-ink-500">none</span>}</span></td>
              <td><span className="cell text-xs text-amber-800">{missing.join(", ")}</span></td>
            </tr>
          ); })}</tbody>
        </table>
      </TableCard>
    </Page>
  );
}
