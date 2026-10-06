import { all, one, run } from "../db";
import { newId, nowIso } from "../ids";
import type { Notification } from "../types";

export function listNotifications(userId: string, limit = 50): Notification[] {
  return all<Notification>("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit);
}

export function countUnread(userId: string): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", userId)!.n;
}

export function notify(userIds: string[], title: string, body: string, href: string, excludeUserId?: string): void {
  const seen = new Set<string>();
  const stmt = "INSERT INTO notifications (id, user_id, title, body, href, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)";
  const ts = nowIso();
  for (const uid of userIds) {
    if (uid === excludeUserId || seen.has(uid)) continue;
    seen.add(uid);
    run(stmt, newId(), uid, title, body, href, ts);
  }
}
