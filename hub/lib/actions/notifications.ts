"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { run } from "../db";

export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  run("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", user.id);
  revalidatePath("/", "layout");
}

export async function markRead(id: string): Promise<void> {
  const user = await requireUser();
  run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", id, user.id);
  revalidatePath("/notifications");
}
