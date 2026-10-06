import { all, one } from "../db";
import type { Client, ClientWithMeta } from "../types";

const META = `
  SELECT c.*,
    (SELECT COUNT(*) FROM workspaces w WHERE w.client_id = c.id) AS workspace_count,
    (SELECT COUNT(*) FROM workspaces w WHERE w.client_id = c.id AND w.status = 'active') AS active_workspaces,
    (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id AND u.role = 'client' AND u.active = 1) AS contact_count
  FROM clients c`;

export function listClients(q = ""): ClientWithMeta[] {
  if (q) return all<ClientWithMeta>(`${META} WHERE c.name LIKE ? OR c.industry LIKE ? ORDER BY c.name COLLATE NOCASE`, `%${q}%`, `%${q}%`);
  return all<ClientWithMeta>(`${META} ORDER BY c.name COLLATE NOCASE`);
}

export function getClient(id: string): ClientWithMeta | undefined {
  return one<ClientWithMeta>(`${META} WHERE c.id = ?`, id);
}

export function getClientPlain(id: string): Client | undefined {
  return one<Client>("SELECT * FROM clients WHERE id = ?", id);
}

export function countClients(): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM clients")!.n;
}
