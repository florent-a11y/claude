import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/books";
import { Notice } from "@/components/ui";
import type { Account, Entity } from "@/lib/types";

/** Helpers shared by the Books pages and server actions (not a "use server" module). */

export type Params = Promise<{ entityId: string }>;
export type Search = Promise<Record<string, string | string[] | undefined>>;

export function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

export async function requireEntity(entityId: string): Promise<Entity> {
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  return entity;
}

export function base(entityId: string): string {
  return `/books/${entityId}`;
}

export function accountLabel(a: Pick<Account, "code" | "name">): string {
  return `${a.code} · ${a.name}`;
}

export function accountOptions(accounts: Account[], filter?: (a: Account) => boolean): Array<{ value: string; label: string }> {
  return accounts.filter((a) => a.active && (!filter || filter(a))).map((a) => ({ value: a.id, label: accountLabel(a) }));
}

export function withError(path: string, error: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}error=${encodeURIComponent(error)}`;
}

export function withFlash(path: string, msg: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}ok=${encodeURIComponent(msg)}`;
}

export function ErrorNotice({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <div className="mb-4"><Notice tone="red">{error}</Notice></div>;
  if (ok) return <div className="mb-4"><Notice tone="green">{ok}</Notice></div>;
  return null;
}

/**
 * Runs a mutation, revalidates the entity's Books pages and redirects: to the path returned by `fn` (or `fallback`),
 * or back to `fallback` with `?error=` when the mutation throws (period locked, unbalanced, forbidden…).
 */
export async function act(entityId: string, fn: () => Promise<string | void>, fallback: string): Promise<never> {
  let error: string | undefined;
  let target: string | undefined;
  try {
    const r = await fn();
    if (typeof r === "string") target = r;
  } catch (e) {
    error = errorMessage(e);
  }
  revalidatePath(`/books/${entityId}`, "layout");
  redirect(error ? withError(fallback, error) : (target ?? fallback));
}
