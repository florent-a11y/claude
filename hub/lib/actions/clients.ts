"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword, requireAdmin, requireInternal } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { pickColor } from "../format";
import { getClientPlain } from "../queries/clients";
import { getUserByEmail } from "../queries/users";
import { str, type ActionState } from "./state";

function clientFields(fd: FormData) {
  return {
    name: str(fd, "name", 200),
    industry: str(fd, "industry", 100),
    website: str(fd, "website", 300),
    email: str(fd, "email", 200),
    phone: str(fd, "phone", 50),
    address: str(fd, "address", 500),
    notes: str(fd, "notes", 10_000),
  };
}

export async function createClient(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireInternal();
  const f = clientFields(fd);
  if (!f.name) return { error: "Company name is required." };
  const id = newId();
  run(
    "INSERT INTO clients (id, name, industry, website, email, phone, address, notes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, f.name, f.industry, f.website, f.email, f.phone, f.address, f.notes, pickColor(f.name), nowIso(),
  );
  redirect(`/clients/${id}`);
}

export async function updateClient(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireInternal();
  if (!getClientPlain(id)) return { error: "Client not found." };
  const f = clientFields(fd);
  if (!f.name) return { error: "Company name is required." };
  run(
    "UPDATE clients SET name = ?, industry = ?, website = ?, email = ?, phone = ?, address = ?, notes = ? WHERE id = ?",
    f.name, f.industry, f.website, f.email, f.phone, f.address, f.notes, id,
  );
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { ok: true };
}

export async function deleteClient(id: string): Promise<void> {
  await requireAdmin();
  run("DELETE FROM clients WHERE id = ?", id);
  revalidatePath("/clients");
  redirect("/clients");
}

const ContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  title: z.string().max(100),
});

/** Creates a portal login for a client contact. */
export async function addContact(clientId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireInternal();
  if (!getClientPlain(clientId)) return { error: "Client not found." };
  const parsed = ContactSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    password: str(fd, "password"),
    title: str(fd, "title", 100),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (getUserByEmail(parsed.data.email)) return { error: "A user with that email already exists." };
  run(
    "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, 'client', ?, ?, ?, 1, ?)",
    newId(), parsed.data.name, parsed.data.email, await hashPassword(parsed.data.password), parsed.data.title, clientId, pickColor(parsed.data.email), nowIso(),
  );
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

const ClientUserSchema = ContactSchema.extend({ client_id: z.string().max(40) });

/** Admin → Clients → Invite: a client login, optionally attached to a company. */
export async function createClientUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = ClientUserSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    password: str(fd, "password"),
    title: str(fd, "title", 100),
    client_id: str(fd, "client_id", 40),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (getUserByEmail(parsed.data.email)) return { error: "A user with that email already exists." };
  const clientId = parsed.data.client_id && getClientPlain(parsed.data.client_id) ? parsed.data.client_id : null;
  run(
    "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, 'client', ?, ?, ?, 1, ?)",
    newId(), parsed.data.name, parsed.data.email, await hashPassword(parsed.data.password), parsed.data.title, clientId, pickColor(parsed.data.email), nowIso(),
  );
  revalidatePath("/admin/clients");
  revalidatePath("/manage/clients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
