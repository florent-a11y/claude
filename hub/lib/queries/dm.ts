import { all, one } from "../db";
import { isInternal } from "../auth";
import { PUBLIC_USER_COLUMNS } from "../auth";
import type { Conversation, ConversationMember, ConversationWithMeta, DirectMessageWithMeta, PublicUser } from "../types";

export function isConversationMember(conversationId: string, userId: string): boolean {
  return !!one("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, userId);
}

function membersOf(conversationIds: string[]): Map<string, ConversationMember[]> {
  const map = new Map<string, ConversationMember[]>();
  if (!conversationIds.length) return map;
  const rows = all<ConversationMember & { conversation_id: string }>(
    `SELECT cm.conversation_id, u.id, u.name, u.color, u.role, u.title, c.name AS client_name, cm.last_read_at
     FROM conversation_members cm JOIN users u ON u.id = cm.user_id LEFT JOIN clients c ON c.id = u.client_id
     WHERE cm.conversation_id IN (${conversationIds.map(() => "?").join(",")}) ORDER BY u.name COLLATE NOCASE`,
    ...conversationIds,
  );
  for (const r of rows) {
    const { conversation_id, ...m } = r;
    map.set(conversation_id, [...(map.get(conversation_id) ?? []), m]);
  }
  return map;
}

export function displayName(c: Conversation, members: ConversationMember[], viewerId: string): string {
  if (c.kind === "group" && c.title) return c.title;
  const others = members.filter((m) => m.id !== viewerId);
  if (!others.length) return "Just you";
  if (c.kind === "direct") return others[0]!.name;
  return others.map((m) => m.name.split(" ")[0]).join(", ");
}

const BASE = `
  SELECT c.*,
    (SELECT m.body FROM direct_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
    (SELECT u.name FROM direct_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_author,
    (SELECT COUNT(*) FROM direct_messages m WHERE m.conversation_id = c.id AND m.created_at > cm.last_read_at AND (m.user_id IS NULL OR m.user_id != cm.user_id)) AS unread
  FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?`;

export function listConversations(userId: string): ConversationWithMeta[] {
  const rows = all<Omit<ConversationWithMeta, "members" | "display_name">>(`${BASE} ORDER BY c.last_message_at DESC`, userId);
  const members = membersOf(rows.map((r) => r.id));
  return rows.map((r) => {
    const m = members.get(r.id) ?? [];
    return { ...r, members: m, display_name: displayName(r, m, userId) };
  });
}

export function getConversationForUser(id: string, userId: string): ConversationWithMeta | undefined {
  const row = one<Omit<ConversationWithMeta, "members" | "display_name">>(`${BASE} WHERE c.id = ?`, userId, id);
  if (!row) return undefined;
  const m = membersOf([id]).get(id) ?? [];
  return { ...row, members: m, display_name: displayName(row, m, userId) };
}

export function getConversation(id: string): Conversation | undefined {
  return one<Conversation>("SELECT * FROM conversations WHERE id = ?", id);
}

export function listMemberIds(conversationId: string): string[] {
  return all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId).map((r) => r.user_id);
}

/** The direct conversation between two people, if it exists. */
export function findDirectConversation(a: string, b: string): Conversation | undefined {
  return one<Conversation>(
    `SELECT c.* FROM conversations c WHERE c.kind = 'direct'
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)`,
    a,
    b,
  );
}

const MSG = `
  SELECT m.*, u.name AS user_name, u.color AS user_color, u.role AS user_role, f.name AS file_name, f.size AS file_size, f.mime AS file_mime
  FROM direct_messages m LEFT JOIN users u ON u.id = m.user_id LEFT JOIN files f ON f.id = m.file_id`;

export function listDirectMessages(conversationId: string, limit = 200): DirectMessageWithMeta[] {
  return all<DirectMessageWithMeta>(`${MSG} WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`, conversationId, limit).reverse();
}

export function listDirectMessagesAfter(conversationId: string, after: string): DirectMessageWithMeta[] {
  return all<DirectMessageWithMeta>(`${MSG} WHERE m.conversation_id = ? AND m.created_at > ? ORDER BY m.created_at ASC, m.rowid ASC LIMIT 200`, conversationId, after);
}

/** Number of conversations with something unread (for the sidebar badge). */
export function countUnreadConversations(userId: string): number {
  return one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM conversation_members cm
     WHERE cm.user_id = ? AND EXISTS (
       SELECT 1 FROM direct_messages m WHERE m.conversation_id = cm.conversation_id AND m.created_at > cm.last_read_at AND (m.user_id IS NULL OR m.user_id != cm.user_id))`,
    userId,
  )!.n;
}

/** People this user may message: the whole team sees everyone; a client sees the team and people who share a workspace with them. */
export function listMessageableUsers(user: PublicUser): (PublicUser & { client_name: string | null })[] {
  const cols = PUBLIC_USER_COLUMNS.split(", ").map((c) => "u." + c).join(", ");
  if (isInternal(user)) {
    return all(`SELECT ${cols}, c.name AS client_name FROM users u LEFT JOIN clients c ON c.id = u.client_id WHERE u.active = 1 AND u.id != ? ORDER BY u.role, c.name COLLATE NOCASE, u.name COLLATE NOCASE`, user.id);
  }
  return all(
    `SELECT ${cols}, c.name AS client_name FROM users u LEFT JOIN clients c ON c.id = u.client_id
     WHERE u.active = 1 AND u.id != ? AND (u.role != 'client' OR EXISTS (
       SELECT 1 FROM workspace_members a JOIN workspace_members b ON a.workspace_id = b.workspace_id WHERE a.user_id = ? AND b.user_id = u.id))
     ORDER BY u.role, u.name COLLATE NOCASE`,
    user.id,
    user.id,
  );
}

export function canMessage(user: PublicUser, targetId: string): boolean {
  return listMessageableUsers(user).some((u) => u.id === targetId);
}
