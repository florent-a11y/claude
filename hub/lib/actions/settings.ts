"use server";

import { revalidatePath } from "next/cache";
import { hashPassword, requireUser, verifyPassword } from "../auth";
import { run } from "../db";
import { getUserWithHash } from "../queries/users";
import { str, type ActionState } from "./state";

export async function updateProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = str(fd, "name", 100);
  if (!name) return { error: "Name is required." };
  const color = str(fd, "color", 7);
  run("UPDATE users SET name = ?, title = ?, color = ? WHERE id = ?", name, str(fd, "title", 100), /^#[0-9a-fA-F]{6}$/.test(color) ? color : user.color, user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const full = getUserWithHash(user.id);
  if (!full) return { error: "User not found." };
  const current = str(fd, "current", 200);
  const next = str(fd, "next", 200);
  if (!(await verifyPassword(current, full.password_hash))) return { error: "Current password is wrong." };
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(next), user.id);
  return { ok: true };
}
