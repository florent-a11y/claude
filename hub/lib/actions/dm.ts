"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { one, run, transaction } from "../db";
import { newId, nowIso } from "../ids";
import { MAX_UPLOAD_BYTES } from "../config";
import { getUser } from "../queries/users";
import { canMessage, findDirectConversation, getConversationForUser, listMemberIds, listMessageableUsers } from "../queries/dm";
import { notify } from "../queries/notifications";
import { saveUpload } from "../services";
import { str, type ActionState } from "./state";

function createConversationRows(kind: "direct" | "group", title: string, creatorId: string, memberIds: string[]): string {
  const id = newId();
  const ts = nowIso();
  transaction(() => {
    run("INSERT INTO conversations (id, kind, title, created_by, created_at, last_message_at) VALUES (?, ?, ?, ?, ?, ?)", id, kind, title, creatorId, ts, ts);
    for (const uid of new Set([creatorId, ...memberIds])) {
      run("INSERT INTO conversation_members (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)", id, uid, ts, ts);
    }
  });
  return id;
}

/** Open (or create) the one-to-one conversation with a person. */
export async function startDirect(targetId: string): Promise<void> {
  const user = await requireUser();
  const target = getUser(targetId);
  if (!target || !target.active || target.id === user.id || !canMessage(user, targetId)) return;
  const existing = findDirectConversation(user.id, targetId);
  const id = existing ? existing.id : createConversationRows("direct", "", user.id, [targetId]);
  redirect(`/messages/${id}`);
}

export async function createConversation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const allowed = new Set(listMessageableUsers(user).map((u) => u.id));
  const ids = [...new Set(fd.getAll("member_ids").filter((v): v is string => typeof v === "string" && allowed.has(v)))];
  if (!ids.length) return { error: "Choose at least one person." };
  if (ids.length === 1) {
    const existing = findDirectConversation(user.id, ids[0]!);
    redirect(`/messages/${existing ? existing.id : createConversationRows("direct", "", user.id, ids)}`);
  }
  const title = str(fd, "title", 100);
  redirect(`/messages/${createConversationRows("group", title, user.id, ids)}`);
}

export async function sendDirectMessage(conversationId: string, fd: FormData): Promise<void> {
  const user = await requireUser();
  const conv = getConversationForUser(conversationId, user.id);
  if (!conv) return;
  const body = str(fd, "body", 10_000);
  const file = fd.get("file");
  let fileId: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return;
    fileId = (await saveUpload(file, { conversationId }, user)).id;
  }
  if (!body && !fileId) return;
  const ts = nowIso();
  run("INSERT INTO direct_messages (id, conversation_id, user_id, body, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), conversationId, user.id, body, fileId, ts);
  run("UPDATE conversations SET last_message_at = ? WHERE id = ?", ts, conversationId);
  run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", ts, conversationId, user.id);
  // One unread notification per conversation at most: skip people who still have one pending.
  const href = `/messages/${conversationId}`;
  const recipients = listMemberIds(conversationId).filter(
    (uid) => uid !== user.id && !one("SELECT 1 FROM notifications WHERE user_id = ? AND href = ? AND read = 0", uid, href),
  );
  notify(recipients, conv.kind === "group" ? `${user.name} in ${conv.title || "a group chat"}` : `New message from ${user.name}`, body ? body.slice(0, 120) : "Sent a file", href);
  revalidatePath("/messages", "layout");
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const user = await requireUser();
  run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", nowIso(), conversationId, user.id);
  run("UPDATE notifications SET read = 1 WHERE user_id = ? AND href = ? AND read = 0", user.id, `/messages/${conversationId}`);
  revalidatePath("/messages", "layout");
}

export async function renameGroup(conversationId: string, fd: FormData): Promise<void> {
  const user = await requireUser();
  const conv = getConversationForUser(conversationId, user.id);
  if (!conv || conv.kind !== "group") return;
  run("UPDATE conversations SET title = ? WHERE id = ?", str(fd, "title", 100), conversationId);
  revalidatePath("/messages", "layout");
}

export async function addToGroup(conversationId: string, fd: FormData): Promise<void> {
  const user = await requireUser();
  const conv = getConversationForUser(conversationId, user.id);
  const uid = str(fd, "user_id", 40);
  if (!conv || conv.kind !== "group" || !uid || !canMessage(user, uid) || conv.members.some((m) => m.id === uid)) return;
  run("INSERT INTO conversation_members (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)", conversationId, uid, nowIso(), nowIso());
  notify([uid], `${user.name} added you to a group chat`, conv.title || "Group chat", `/messages/${conversationId}`);
  revalidatePath("/messages", "layout");
}

export async function leaveGroup(conversationId: string): Promise<void> {
  const user = await requireUser();
  const conv = getConversationForUser(conversationId, user.id);
  if (!conv || conv.kind !== "group") return;
  run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, user.id);
  if (!one("SELECT 1 FROM conversation_members WHERE conversation_id = ?", conversationId)) run("DELETE FROM conversations WHERE id = ?", conversationId);
  revalidatePath("/messages", "layout");
  redirect("/messages");
}
