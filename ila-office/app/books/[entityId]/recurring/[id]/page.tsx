import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { occurrencesDue } from "@/lib/recurring";
import { Badge, Card, CardTable, Cols, Dash, DL, Notice } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { KindBadge, PayloadCard, StatusBadge, TemplateFields, describeTemplate, occurrencesLabel, repeatsLabel, runHref } from "../shared";
import { deleteTemplateAction, runTemplateAction, setStatusAction, updateTemplateAction } from "../actions";

export const dynamic = "force-dynamic";

/** One recurring transaction: schedule (editable), what repeats, run history, pause/resume/delete. */
export default async function RecurringTemplatePage({ params, searchParams }: { params: Promise<{ entityId: string; id: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, id } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const t = await db.get("recurring_templates", id);
  if (!t || t.entityId !== entityId) notFound();
  const [description, creator] = await Promise.all([describeTemplate(entityId, t, base(entityId)), t.createdByUserId ? db.get("users", t.createdByUserId) : Promise.resolve(null)]);
  const today = todayISO();
  const write = can(user, "books:write");
  const b = base(entityId);
  const list = `${b}/recurring`;
  const here = `${list}/${t.id}`;
  const pending = t.status === "active" ? occurrencesDue(t, today) : [];
  const runs = [...t.runs].reverse();
  const failed = t.runs.filter((r) => r.error).length;
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={list} className="hover:underline">Recurring</Link> / {t.name}</p>
          <h2 className="text-xl font-bold">{t.name} <KindBadge kind={t.kind} /> <StatusBadge status={t.status} /></h2>
          <p className="text-sm text-ink-700">{repeatsLabel(t)}{t.status === "ended" ? ` · ended ${t.endDate ? fmtDate(t.endDate) : ""}` : ` · next document ${fmtDate(t.nextDate)}`}{t.endDate && t.status !== "ended" ? ` · until ${fmtDate(t.endDate)}` : ""}</p>
        </div>
        {write && (
          <div className="flex flex-wrap items-center gap-2 no-print">
            {pending.length > 0 && <ConfirmForm action={runTemplateAction.bind(null, entityId, t.id, here)} message={`Create ${occurrencesLabel(pending)} of “${t.name}” now?`}><button className="btn-primary" type="submit">Run due now ({pending.length})</button></ConfirmForm>}
            {t.status === "active" && <ConfirmForm action={setStatusAction.bind(null, entityId, t.id, "paused", here)} message={`Pause “${t.name}”? Nothing is created until it is resumed.`}><button className="btn-secondary" type="submit">Pause</button></ConfirmForm>}
            {t.status === "paused" && <ConfirmForm action={setStatusAction.bind(null, entityId, t.id, "active", here)} message={`Resume “${t.name}”? Its next date is ${fmtDate(t.nextDate)}${t.nextDate <= today ? `: ${occurrencesLabel(occurrencesDue(t, today))} will be created on the next run` : ""}.`}><button className="btn-secondary" type="submit">Resume</button></ConfirmForm>}
            <ConfirmForm action={deleteTemplateAction.bind(null, entityId, t.id)} message={`Delete “${t.name}”? The documents it already created stay in the books.`}><button className="btn-danger" type="submit">Delete</button></ConfirmForm>
          </div>
        )}
      </div>
      {pending.length > 0 && <Notice tone="amber">{occurrencesLabel(pending)} due: created on the next daily run, or now with “Run due now”.</Notice>}
      {t.status === "ended" && <Notice tone="blue">This recurring transaction has reached its end date. Extend or clear the end date below to continue it.</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <Card title="Schedule">
            <form action={updateTemplateAction.bind(null, entityId, t.id)} className="space-y-4">
              <TemplateFields t={t} showNext />
              {write && <SubmitButton>Save schedule</SubmitButton>}
            </form>
          </Card>
          <Card title={`Run history (${t.runs.length})`} actions={failed > 0 ? <Badge tone="red">{failed} failed</Badge> : undefined}>
            {runs.length === 0 ? <p className="text-sm text-ink-500">Nothing created yet. The first document is dated {fmtDate(t.nextDate)}.</p> : (
              <CardTable>
                <table className="table table-data min-w-[720px]">
                  <Cols widths={[118, 170, 160, undefined]} />
                  <thead><tr><th>Dated</th><th>Run at</th><th>Document</th><th>Result</th></tr></thead>
                  <tbody>
                    {runs.map((r, i) => {
                      const href = runHref(b, t.kind, r);
                      return (
                        <tr key={i}>
                          <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(r.at)}</td>
                          <td>{href ? <Link href={href} className="cell font-medium" title={r.number}>{r.number ?? "open"}</Link> : r.number ? <span className="cell">{r.number}</span> : <Dash />}</td>
                          <td>{r.error ? <span className="cell text-red-700" title={r.error}>{r.error}</span> : <span className="cell text-green-800">{t.kind === "invoice" || t.kind === "bill" ? (r.journalId ? "created and posted" : "created as draft") : "posted"}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardTable>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <PayloadCard kind={t.kind} description={description} />
          <Card title="Details">
            <DL items={[["Created", fmtDateTime(t.createdAt)], ["Created by", creator?.name ?? "—"], ["Last run", t.lastRunAt ? fmtDateTime(t.lastRunAt) : "—"], ["Updated", t.updatedAt ? fmtDateTime(t.updatedAt) : "—"]]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
