"use server";

import { revalidatePath } from "next/cache";
import { isInternal, requireUser } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { getTask } from "../queries/tasks";
import { getUser } from "../queries/users";
import { getWorkspaceForUser } from "../queries/workspaces";
import { notify } from "../queries/notifications";
import { logSystem, touchWorkspace } from "../services";
import { bool, isDate, opt, str, type ActionState } from "./state";
import type { TaskPriority, TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high"];

function revalidate(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function createTask(workspaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ws = getWorkspaceForUser(workspaceId, user);
  if (!ws) return { error: "Workspace not found." };
  const title = str(fd, "title", 300);
  if (!title) return { error: "Give the task a title." };
  const due = opt(fd, "due_date", 10);
  if (!isDate(due)) return { error: "Invalid due date." };
  const priority = (str(fd, "priority", 10) || "normal") as TaskPriority;
  const assigneeId = opt(fd, "assignee_id", 40);
  const kind = str(fd, "kind", 20) === "file_request" ? "file_request" : "task";
  const internal = isInternal(user) && bool(fd, "internal");
  const id = newId();
  const ts = nowIso();
  run(
    `INSERT INTO tasks (id, workspace_id, title, description, kind, assignee_id, due_date, status, priority, internal, created_by, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, NULL)`,
    id, workspaceId, title, str(fd, "description", 5000), kind, assigneeId && getUser(assigneeId) ? assigneeId : null, due,
    PRIORITIES.includes(priority) ? priority : "normal", internal ? 1 : 0, user.id, ts, ts,
  );
  logSystem(workspaceId, user.id, `${kind === "file_request" ? "requested a file" : "created a task"}: ${title}`, { internal, refType: "task", refId: id, card: true });
  if (assigneeId && assigneeId !== user.id) {
    notify([assigneeId], `New task in ${ws.name}`, title, `/workspaces/${workspaceId}/tasks`);
  }
  revalidate(workspaceId);
  return { ok: true };
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  const user = await requireUser();
  const task = getTask(taskId);
  if (!task || !STATUSES.includes(status)) return;
  const ws = getWorkspaceForUser(task.workspace_id, user);
  if (!ws || (task.internal && !isInternal(user))) return;
  const ts = nowIso();
  run("UPDATE tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?", status, ts, status === "done" ? ts : null, taskId);
  if (status === "done") {
    logSystem(task.workspace_id, user.id, `completed: ${task.title}`, { internal: !!task.internal, refType: "task", refId: taskId });
    if (task.created_by && task.created_by !== user.id) {
      notify([task.created_by], `Task completed in ${ws.name}`, `${user.name} completed "${task.title}"`, `/workspaces/${task.workspace_id}/tasks`);
    }
  } else {
    touchWorkspace(task.workspace_id);
  }
  revalidate(task.workspace_id);
}

export async function updateTask(taskId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const task = getTask(taskId);
  if (!task) return { error: "Task not found." };
  const ws = getWorkspaceForUser(task.workspace_id, user);
  if (!ws || (task.internal && !isInternal(user))) return { error: "Not allowed." };
  const title = str(fd, "title", 300);
  if (!title) return { error: "Title is required." };
  const due = opt(fd, "due_date", 10);
  if (!isDate(due)) return { error: "Invalid due date." };
  const priority = (str(fd, "priority", 10) || task.priority) as TaskPriority;
  const status = (str(fd, "status", 20) || task.status) as TaskStatus;
  const assigneeId = opt(fd, "assignee_id", 40);
  const internal = isInternal(user) ? bool(fd, "internal") : !!task.internal;
  const ts = nowIso();
  run(
    `UPDATE tasks SET title = ?, description = ?, assignee_id = ?, due_date = ?, status = ?, priority = ?, internal = ?, updated_at = ?,
       completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?`,
    title, str(fd, "description", 5000), assigneeId && getUser(assigneeId) ? assigneeId : null, due,
    STATUSES.includes(status) ? status : task.status, PRIORITIES.includes(priority) ? priority : task.priority, internal ? 1 : 0, ts, status, ts, taskId,
  );
  if (assigneeId && assigneeId !== task.assignee_id && assigneeId !== user.id) {
    notify([assigneeId], `Task assigned to you in ${ws.name}`, title, `/workspaces/${task.workspace_id}/tasks`);
  }
  touchWorkspace(task.workspace_id);
  revalidate(task.workspace_id);
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<void> {
  const user = await requireUser();
  const task = getTask(taskId);
  if (!task || !isInternal(user)) return;
  if (!getWorkspaceForUser(task.workspace_id, user)) return;
  run("DELETE FROM tasks WHERE id = ?", taskId);
  revalidate(task.workspace_id);
}
