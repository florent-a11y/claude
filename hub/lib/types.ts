export type Role = "admin" | "member" | "client";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  title: string;
  client_id: string | null;
  color: string;
  active: number;
  created_at: string;
}
export type PublicUser = Omit<User, "password_hash">;

export interface Client {
  id: string;
  name: string;
  industry: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  color: string;
  created_at: string;
}
export interface ClientWithMeta extends Client {
  workspace_count: number;
  active_workspaces: number;
  contact_count: number;
}

export type WorkspaceStatus = "active" | "on_hold" | "completed" | "archived";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  client_id: string | null;
  status: WorkspaceStatus;
  owner_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}
export interface WorkspaceWithMeta extends Workspace {
  client_name: string | null;
  client_color: string | null;
  owner_name: string | null;
  member_count: number;
  open_tasks: number;
  pending_approvals: number;
}

export type MessageKind = "text" | "system";
export interface Message {
  id: string;
  workspace_id: string;
  user_id: string | null;
  kind: MessageKind;
  body: string;
  internal: number;
  file_id: string | null;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}
export interface MessageWithMeta extends Message {
  user_name: string | null;
  user_color: string | null;
  user_role: Role | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
}

export interface FileRow {
  id: string;
  workspace_id: string | null;
  conversation_id: string | null;
  uploader_id: string | null;
  name: string;
  size: number;
  mime: string;
  storage_key: string;
  folder: string;
  internal: number;
  created_at: string;
}
export interface FileWithMeta extends FileRow {
  uploader_name: string | null;
  uploader_color: string | null;
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";
export type TaskKind = "task" | "file_request";
export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  kind: TaskKind;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  internal: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
export interface TaskWithMeta extends Task {
  assignee_name: string | null;
  assignee_color: string | null;
  workspace_name: string;
  client_name: string | null;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface Approval {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  requested_by: string | null;
  approver_id: string | null;
  file_id: string | null;
  status: ApprovalStatus;
  decision_note: string;
  due_date: string | null;
  decided_at: string | null;
  created_at: string;
}
export interface ApprovalWithMeta extends Approval {
  requester_name: string | null;
  requester_color: string | null;
  approver_name: string | null;
  approver_color: string | null;
  file_name: string | null;
  workspace_name: string;
  client_name: string | null;
}

export type TemplateStepType = "task" | "file_request" | "approval" | "message";
export interface TemplateStep {
  type: TemplateStepType;
  title: string;
  description: string;
  due_in_days: number | null;
  /** Who gets the step when applied: the workspace owner, the first client contact, nobody… */
  assign_to: "team" | "client" | "none";
  /** …or one specific member (used when a project is built inside a workspace). */
  assignee_id?: string | null;
  internal: boolean;
}
export interface Template {
  id: string;
  name: string;
  description: string;
  steps: string;
  created_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  href: string;
  read: number;
  created_at: string;
}

export type ConversationKind = "direct" | "group";
export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  created_by: string | null;
  created_at: string;
  last_message_at: string;
}
export interface ConversationMember {
  id: string;
  name: string;
  color: string;
  role: Role;
  title: string;
  client_name: string | null;
  last_read_at: string;
}
export interface ConversationWithMeta extends Conversation {
  members: ConversationMember[];
  /** Display name from the viewer's point of view. */
  display_name: string;
  last_body: string | null;
  last_author: string | null;
  unread: number;
}
export interface DirectMessageWithMeta {
  id: string;
  conversation_id: string;
  user_id: string | null;
  body: string;
  file_id: string | null;
  created_at: string;
  user_name: string | null;
  user_color: string | null;
  user_role: Role | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
}
