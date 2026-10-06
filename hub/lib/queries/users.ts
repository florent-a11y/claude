import { all, one } from "../db";
import { PUBLIC_USER_COLUMNS } from "../auth";
import type { PublicUser, User } from "../types";

export function countUsers(): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM users")!.n;
}

export function getUserByEmail(email: string): User | undefined {
  return one<User>("SELECT * FROM users WHERE email = ?", email.trim());
}

export function getUser(id: string): PublicUser | undefined {
  return one<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, id);
}

export function getUserWithHash(id: string): User | undefined {
  return one<User>("SELECT * FROM users WHERE id = ?", id);
}

/** Internal team members (admins + members). */
export function listTeam(includeInactive = false): PublicUser[] {
  return all<PublicUser>(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE role IN ('admin','member') ${includeInactive ? "" : "AND active = 1"}
     ORDER BY active DESC, name COLLATE NOCASE`,
  );
}

export function listClientContacts(clientId: string): PublicUser[] {
  return all<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE role = 'client' AND client_id = ? ORDER BY name COLLATE NOCASE`, clientId);
}

export function listAllClientUsers(): (PublicUser & { client_name: string | null })[] {
  return all(
    `SELECT ${PUBLIC_USER_COLUMNS.split(", ").map((c) => "u." + c).join(", ")}, c.name AS client_name
     FROM users u LEFT JOIN clients c ON c.id = u.client_id
     WHERE u.role = 'client' AND u.active = 1 ORDER BY c.name COLLATE NOCASE, u.name COLLATE NOCASE`,
  );
}

export function listActiveUsers(): PublicUser[] {
  return all<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE active = 1 ORDER BY role, name COLLATE NOCASE`);
}
