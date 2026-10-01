import { fmtDateTime } from "@/lib/dates";
import type { Activity, ActivityKind } from "@/lib/types";
import { Card, Badge, Field, Select, type Tone } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { addActivity, deleteActivity } from "../activities/actions";
import type { ActivityRefs } from "../_lib/server";

const KIND_TONE: Record<ActivityKind, Tone> = { note: "slate", call: "blue", email: "indigo", whatsapp: "green", meeting: "amber", status: "brand", system: "slate" };
const KINDS = [{ value: "note", label: "Note" }, { value: "call", label: "Call" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "meeting", label: "Meeting" }];

/** Activity timeline with an add-entry form. `refs` are stamped on new entries; `backPath` is revalidated. */
export function Timeline({ activities, refs, backPath, canWrite = true, title = "Activity" }: { activities: Activity[]; refs: ActivityRefs; backPath: string; canWrite?: boolean; title?: string }) {
  return (
    <Card title={title}>
      {canWrite && (
        <form action={addActivity.bind(null, refs, backPath)} className="mb-4 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[8rem_1fr]">
          <Field label="Type"><Select name="kind" defaultValue="note" options={KINDS} className="input !py-1.5" /></Field>
          <Field label="Subject"><input name="subject" required className="input !py-1.5" placeholder="Called about passport copy…" /></Field>
          <Field label="Details" className="md:col-span-2"><textarea name="body" rows={2} className="input" placeholder="Optional details" /></Field>
          <div className="md:col-span-2"><SubmitButton className="btn-secondary !py-1.5" pendingText="Adding…">Add to timeline</SubmitButton></div>
        </form>
      )}
      {activities.length === 0 ? <p className="text-sm text-ink-500">Nothing logged yet.</p> : (
        <ol className="divide-y divide-slate-100 text-sm">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-3 py-2">
              <div className="w-28 shrink-0 text-xs text-ink-500">{fmtDateTime(a.at)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={KIND_TONE[a.kind] ?? "slate"}>{a.kind}</Badge>
                  <span className="font-medium">{a.subject}</span>
                  {a.byName && <span className="text-xs text-ink-500">· {a.byName}</span>}
                </div>
                {a.body && <p className="mt-1 whitespace-pre-wrap text-ink-700">{a.body}</p>}
              </div>
              {canWrite && (a.kind !== "status" && a.kind !== "system") && (
                <ConfirmForm action={deleteActivity.bind(null, a.id, backPath)} message="Delete this entry?"><button className="text-xs text-ink-500 hover:text-red-600">×</button></ConfirmForm>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
