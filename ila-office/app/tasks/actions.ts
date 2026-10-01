"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { str } from "@/lib/util";
import type { TaskItem } from "@/lib/types";

const RELATED = ["contact", "company", "deal", "project", "quote", "entity", "obligation"] as const;
type RelatedType = (typeof RELATED)[number];
const schema = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.iso.date().optional(),
  assigneeUserId: z.string().optional(),
  related: z.string().regex(/^[a-z]+:.+$/).optional(),
});

/** Any signed-in user may create tasks for themselves or colleagues (tasks are personal to-dos, not CRM records). */
export async function createTask(backPath: string, fd: FormData) {
  const me = await requireUser();
  const v = schema.parse({ title: str(fd, "title"), dueDate: str(fd, "dueDate"), assigneeUserId: str(fd, "assigneeUserId"), related: str(fd, "related") });
  let related: TaskItem["related"];
  if (v.related) {
    const [type, id] = v.related.split(":", 2);
    if ((RELATED as readonly string[]).includes(type) && id) related = { type: type as RelatedType, id };
  }
  const task: TaskItem = { id: db.newId(), title: v.title, dueDate: v.dueDate, done: false, assigneeUserId: v.assigneeUserId || me.id, related, createdAt: nowISO() };
  await db.insert("tasks", task);
  revalidatePath(backPath);
  revalidatePath("/tasks");
}

export async function toggleTask(id: string, backPath: string) {
  await requireUser();
  const t = await db.get("tasks", id);
  if (!t) throw new Error("Task not found");
  await db.update("tasks", id, { done: !t.done, doneAt: t.done ? undefined : nowISO() });
  revalidatePath(backPath);
  revalidatePath("/tasks");
}

export async function deleteTask(id: string, backPath: string) {
  await requireUser();
  await db.remove("tasks", id);
  revalidatePath(backPath);
  revalidatePath("/tasks");
}
