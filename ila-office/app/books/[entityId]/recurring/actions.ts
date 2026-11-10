"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { createTemplate, deleteTemplate, runDueForEntity, runTemplateDue, setStatus, updateTemplate, type RunSummary, type TemplateFields } from "@/lib/recurring-services";
import { bool, num, str } from "@/lib/util";
import { act, base } from "../shared";
import { loadSourceDraft } from "./shared";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  frequency: z.enum(["weekly", "monthly", "quarterly", "semiannual", "annual"]),
  dayOfMonth: z.number().int().min(1, "Day of month must be 1–31").max(31, "Day of month must be 1–31").optional(),
  startDate: z.string().regex(ISO, "Start date is required"),
  nextDate: z.string().regex(ISO, "Next date must be a date").optional(),
  endDate: z.string().regex(ISO, "End date must be a date").optional(),
  autoPost: z.boolean(),
  dueDays: z.number().int().min(0, "Due days must be 0–365").max(365, "Due days must be 0–365").optional(),
});

/** Reads the schedule form; empty optional fields come back as explicit `undefined` keys so an update clears them. */
function readFields(fd: FormData): TemplateFields {
  const v = schema.parse({
    name: str(fd, "name"), frequency: str(fd, "frequency"), dayOfMonth: str(fd, "dayOfMonth") === undefined ? undefined : num(fd, "dayOfMonth"),
    startDate: str(fd, "startDate"), nextDate: str(fd, "nextDate"), endDate: str(fd, "endDate"), autoPost: bool(fd, "autoPost"),
    dueDays: str(fd, "dueDays") === undefined ? undefined : num(fd, "dueDays"),
  });
  return { name: v.name, frequency: v.frequency, dayOfMonth: v.dayOfMonth, startDate: v.startDate, nextDate: v.nextDate, endDate: v.endDate, autoPost: v.autoPost, dueDays: v.dueDays };
}

function runMessage(s: RunSummary): string {
  if (s.runs.length === 0) return "Nothing due: every recurring transaction is up to date.";
  const made = s.runs.filter((r) => !r.error).map((r) => r.number).filter(Boolean);
  const parts = [`${s.created} document${s.created === 1 ? "" : "s"} created${made.length ? ` (${made.slice(0, 6).join(", ")}${made.length > 6 ? "…" : ""})` : ""}`];
  if (s.failed) parts.push(`${s.failed} failed: ${s.runs.filter((r) => r.error).map((r) => `${r.name} ${r.date}: ${r.error}`).slice(0, 3).join("; ")}`);
  return parts.join(". ");
}

export async function createTemplateAction(entityId: string, fd: FormData) {
  const from = str(fd, "from");
  const list = `${base(entityId)}/recurring`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const draft = await loadSourceDraft(entityId, from);
    const f = readFields(fd);
    const t = await createTemplate(entityId, { ...draft, ...f, nextDate: f.startDate }, user.id);
    return `${list}?ok=${encodeURIComponent(`“${t.name}” repeats ${t.frequency}; first document on ${t.nextDate}${t.status === "ended" ? " (already past its end date)" : ""}`)}`;
  }, `${list}/new${from ? `?from=${encodeURIComponent(from)}` : ""}`);
}

export async function updateTemplateAction(entityId: string, id: string, fd: FormData) {
  const to = `${base(entityId)}/recurring/${id}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const t = await updateTemplate(entityId, id, readFields(fd));
    return `${to}?ok=${encodeURIComponent(`Saved: next document on ${t.nextDate}${t.status !== "active" ? ` (${t.status})` : ""}`)}`;
  }, to);
}

export async function setStatusAction(entityId: string, id: string, status: "active" | "paused", backTo: string) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    const t = await setStatus(entityId, id, status);
    return `${backTo}?ok=${encodeURIComponent(status === "paused" ? `“${t.name}” paused; nothing is created until it is resumed` : `“${t.name}” resumed; next document on ${t.nextDate}`)}`;
  }, backTo);
}

export async function deleteTemplateAction(entityId: string, id: string) {
  const list = `${base(entityId)}/recurring`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    await deleteTemplate(entityId, id);
    return `${list}?ok=${encodeURIComponent("Recurring transaction deleted; the documents it created stay in the books")}`;
  }, list);
}

/** "Run due now" for the whole entity: every active template whose next date is today or earlier. */
export async function runDueAction(entityId: string) {
  const list = `${base(entityId)}/recurring`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    return `${list}?ok=${encodeURIComponent(runMessage(await runDueForEntity(entityId, todayISO(), user.id)))}`;
  }, list);
}

/** "Run due now" for one template. */
export async function runTemplateAction(entityId: string, id: string, backTo: string) {
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    return `${backTo}?ok=${encodeURIComponent(runMessage(await runTemplateDue(entityId, id, todayISO(), user.id)))}`;
  }, backTo);
}
