"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword, requireAdmin, revokeUserSessions } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { pickColor } from "../format";
import { getUser, getUserByEmail } from "../queries/users";
import { str, type ActionState } from "./state";

const MemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(["admin", "member"]),
  title: z.string().max(100),
});

export async function createTeamMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = MemberSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    password: str(fd, "password"),
    role: str(fd, "role", 10),
    title: str(fd, "title", 100),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (getUserByEmail(parsed.data.email)) return { error: "A user with that email already exists." };
  run(
    "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?)",
    newId(), parsed.data.name, parsed.data.email, await hashPassword(parsed.data.password), parsed.data.role, parsed.data.title, pickColor(parsed.data.email), nowIso(),
  );
  revalidatePath("/team");
  return { ok: true };
}

export async function setUserRole(userId: string, role: "admin" | "member"): Promise<void> {
  const admin = await requireAdmin();
  const target = getUser(userId);
  if (!target || target.role === "client" || target.id === admin.id) return;
  if (role !== "admin" && role !== "member") return;
  run("UPDATE users SET role = ? WHERE id = ?", role, userId);
  revalidatePath("/team");
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const admin = await requireAdmin();
  const target = getUser(userId);
  if (!target || target.id === admin.id) return;
  run("UPDATE users SET active = ? WHERE id = ?", active ? 1 : 0, userId);
  if (!active) revokeUserSessions(userId);
  revalidatePath("/team");
  if (target.client_id) revalidatePath(`/clients/${target.client_id}`);
}

export async function resetUserPassword(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const target = getUser(userId);
  if (!target) return { error: "User not found." };
  const password = str(fd, "password", 200);
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(password), userId);
  revokeUserSessions(userId);
  return { ok: true };
}
