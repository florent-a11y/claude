"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/util";
import { logActivity, type ActivityRefs } from "../_lib/server";

const schema = z.object({
  kind: z.enum(["note", "call", "email", "whatsapp", "meeting"]),
  subject: z.string().min(1).max(200),
  body: z.string().max(5000).optional(),
});

/** Adds a note / call / WhatsApp / meeting entry to a record's timeline. */
export async function addActivity(refs: ActivityRefs, backPath: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const v = schema.parse({ kind: str(fd, "kind") ?? "note", subject: str(fd, "subject"), body: str(fd, "body") });
  await logActivity({ kind: v.kind, subject: v.subject, body: v.body, user, ...refs });
  revalidatePath(backPath);
}

export async function deleteActivity(id: string, backPath: string) {
  await requirePermission("crm:write");
  await db.remove("activities", id);
  revalidatePath(backPath);
}
