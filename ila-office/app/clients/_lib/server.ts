import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { fullName } from "@/lib/util";
import { fmtMoney } from "@/lib/money";
import type { SessionUser } from "@/lib/auth";
import type { Activity, ActivityKind, Company, Contact, ServiceItem, User } from "@/lib/types";

/** Server-only helpers shared by the CRM pages and actions (not a "use server" file). */

export type ActivityRefs = Pick<Activity, "contactId" | "companyId" | "entityId">;

export async function logActivity(input: { kind?: ActivityKind; subject: string; body?: string; user?: SessionUser | null } & ActivityRefs): Promise<Activity> {
  const { kind = "system", subject, body, user, ...refs } = input;
  const row: Activity = { id: db.newId(), kind, subject, body, at: nowISO(), byUserId: user?.id, byName: user?.name, ...clean(refs) };
  await db.insert("activities", row);
  return row;
}

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
}

export interface Lookups {
  companies: Map<string, Company>;
  contacts: Map<string, Contact>;
  users: Map<string, User>;
  company: (id?: string) => string;
  contact: (id?: string) => string;
  user: (id?: string) => string;
  activeUsers: User[];
}

/** Name maps for companies, contacts and users (the CRM data set is small enough to load whole). */
export async function lookups(): Promise<Lookups> {
  const [companies, contacts, users] = await Promise.all([db.list("companies"), db.list("contacts"), db.list("users")]);
  const cm = new Map(companies.map((c) => [c.id, c]));
  const km = new Map(contacts.map((c) => [c.id, c]));
  const um = new Map(users.map((u) => [u.id, u]));
  return {
    companies: cm, contacts: km, users: um,
    company: (id) => (id ? cm.get(id)?.name ?? "—" : "—"),
    contact: (id) => (id ? fullName(km.get(id)) || "—" : "—"),
    user: (id) => (id ? um.get(id)?.name ?? "—" : "—"),
    activeUsers: users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function activeUsers(): Promise<User[]> {
  return (await db.list("users", { where: (u) => u.active })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function activeServices(): Promise<ServiceItem[]> {
  const all = await db.list("services");
  return all.filter((s) => s.active).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code));
}

/** Activities for a record, newest first. */
export async function activitiesFor(where: (a: Activity) => boolean, limit = 200): Promise<Activity[]> {
  return db.list("activities", { where, orderBy: "at", desc: true, limit });
}

export const userOptions = (users: User[], none = "— unassigned —") => [{ value: "", label: none }, ...users.map((u) => ({ value: u.id, label: u.name }))];
export const companyOptions = (companies: Company[], none = "— none —") => [{ value: "", label: none }, ...companies.map((c) => ({ value: c.id, label: c.name }))];
export const contactOptions = (contacts: Contact[], none = "— none —") => [{ value: "", label: none }, ...contacts.map((c) => ({ value: c.id, label: fullName(c) || c.email || c.id }))];

export function sortedCompanies(l: Lookups): Company[] {
  return [...l.companies.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function sortedContacts(l: Lookups): Contact[] {
  return [...l.contacts.values()].sort((a, b) => fullName(a).localeCompare(fullName(b)));
}

/** "villa, investor,bali" → ["villa","investor","bali"] (unique, trimmed). */
export function parseTags(s: string | undefined): string[] {
  return [...new Set((s ?? "").split(",").map((t) => t.trim()).filter(Boolean))];
}

/** { IDR: 1000, USD: 2 } → "IDR 1,000 + $2.00" for multi-currency pipeline totals. */
export function fmtAmounts(rec: Record<string, number>, empty = "—"): string {
  const parts = Object.entries(rec).filter(([, v]) => v !== 0).sort(([a], [b]) => (a === "IDR" ? -1 : b === "IDR" ? 1 : a.localeCompare(b))).map(([c, v]) => fmtMoney(v, c));
  return parts.length ? parts.join(" + ") : empty;
}
