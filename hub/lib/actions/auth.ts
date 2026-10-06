"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, hashPassword, verifyPassword } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { pickColor } from "../format";
import { countUsers, getUserByEmail } from "../queries/users";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "../rate-limit";
import { str, type ActionState } from "./state";

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email", 200).toLowerCase();
  const password = str(fd, "password", 200);
  if (!email || !password) return { error: "Enter your email and password." };
  if (loginBlocked(email)) return { error: "Too many attempts. Try again in 15 minutes." };
  const user = getUserByEmail(email);
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    recordLoginFailure(email);
    return { error: "Wrong email or password." };
  }
  clearLoginFailures(email);
  await createSession(user.id);
  const next = str(fd, "next", 500);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const SetupSchema = z.object({
  name: z.string().min(1, "Your name is required").max(100),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

/** Creates the first administrator. Only works while the user table is empty. */
export async function setup(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (countUsers() > 0) redirect("/login");
  const parsed = SetupSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), password: str(fd, "password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const id = newId();
  run(
    "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, 'admin', '', NULL, ?, 1, ?)",
    id, parsed.data.name, parsed.data.email, await hashPassword(parsed.data.password), pickColor(parsed.data.email), nowIso(),
  );
  await createSession(id);
  redirect("/");
}
