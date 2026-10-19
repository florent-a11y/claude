import type { Role } from "./types";

/**
 * Who may see and change what.
 * Team roles (admin, consultant, accountant, viewer) see every entity, company, contact and vendor.
 * Client users see only the entities allocated to them (and the company records linked to those entities), read-only.
 */

export type Permission = "crm:write" | "books:write" | "tax:write" | "admin" | "read";
export type Actor = { role: Role; entityIds?: string[] } | null | undefined;

export function isClient(user: Actor): boolean {
  return user?.role === "client";
}

export function can(user: Actor, perm: Permission): boolean {
  if (!user) return false;
  if (perm === "read") return true;
  if (user.role === "client" || user.role === "viewer") return false;
  if (user.role === "admin") return true;
  if (perm === "admin") return false;
  if (perm === "crm:write") return user.role === "consultant";
  return user.role === "accountant"; // books:write, tax:write
}

/** Entities this user may open: `null` means all of them (team), otherwise the allocated ids. */
export function allowedEntityIds(user: Actor): Set<string> | null {
  if (!user) return new Set();
  if (user.role !== "client") return null;
  return new Set(user.entityIds ?? []);
}

export function canAccessEntity(user: Actor, entityId: string | undefined | null): boolean {
  const allowed = allowedEntityIds(user);
  if (allowed === null) return true;
  return !!entityId && allowed.has(entityId);
}

/** Keeps the rows whose entity the user may see (all rows for team users). */
export function scopeByEntity<T>(user: Actor, rows: T[], entityIdOf: (row: T) => string | undefined | null): T[] {
  const allowed = allowedEntityIds(user);
  if (allowed === null) return rows;
  return rows.filter((r) => { const id = entityIdOf(r); return !!id && allowed.has(id); });
}

export function scopeEntities<T extends { id: string }>(user: Actor, entities: T[]): T[] {
  return scopeByEntity(user, entities, (e) => e.id);
}
