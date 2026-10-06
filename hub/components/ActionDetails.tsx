"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Paperclip, Send, ThumbsDown, ThumbsUp, Trash2, Upload, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { setTaskStatus, deleteTask } from "@/lib/actions/tasks";
import { uploadFiles } from "@/lib/actions/files";
import { cancelApproval, decideApproval, deleteApproval } from "@/lib/actions/approvals";
import { postMessage } from "@/lib/actions/messages";
import { STATUS_LABEL, STEP_TYPES, type Step } from "@/lib/steps";
import { dueLabel, formatDateTime, isOverdue } from "@/lib/format";
import type { MessageWithMeta, Role } from "@/lib/types";

/** Moxo's "Action Details" side panel: progress, activity log and comments for one step. */
export function ActionDetails({ step, index, workspaceId, me, canManage, onClose }: {
  step: Step;
  index: number;
  workspaceId: string;
  me: { id: string; name: string; color: string; role: Role };
  canManage: boolean;
  onClose: () => void;
}) {
  const t = STEP_TYPES[step.kind];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activity, setActivity] = useState<MessageWithMeta[]>([]);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<File | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/messages?ref=${encodeURIComponent(step.id)}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setActivity(((await res.json()) as { messages: MessageWithMeta[] }).messages);
  }, [workspaceId, step.id]);
  useEffect(() => { void load(); }, [load, step.status]);

  const after = () => start(async () => { router.refresh(); await load(); });
  const isTask = step.kind !== "approval";
  const mine = step.assignee?.id === me.id;
  const open = step.status !== "completed" && step.status !== "cancelled" && step.status !== "rejected";
  const canDecide = step.kind === "approval" && step.status === "not_started" && (mine || me.role === "admin");
  const ref = { ref_type: isTask ? "task" : "approval", ref_id: step.id };

  function sendComment() {
    if (!comment.trim() && !attachment) return;
    const fd = new FormData();
    fd.set("body", comment);
    fd.set("ref_type", ref.ref_type);
    fd.set("ref_id", ref.ref_id);
    if (attachment) fd.set("file", attachment);
    setComment("");
    setAttachment(null);
    start(async () => { await postMessage(workspaceId, fd); await load(); });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col bg-white shadow-2xl lg:inset-auto lg:bottom-3 lg:right-3 lg:top-[4.25rem] lg:w-[24rem] lg:rounded-xl lg:border lg:border-slate-200 xl:w-[26rem]" role="dialog" aria-label="Action details">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Action Details (Step {index})</h2>
        <div className="flex items-center gap-1">
          {canManage && (
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} className="btn btn-ghost px-2" aria-label="More"><MoreHorizontal className="h-4 w-4" /></button>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {isTask && open && step.status === "not_started" && (
                    <button type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => { setMenu(false); start(async () => { await setTaskStatus(step.id, "in_progress"); after(); }); }}>Mark in progress</button>
                  )}
                  {isTask && !open && (
                    <button type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => { setMenu(false); start(async () => { await setTaskStatus(step.id, "todo"); after(); }); }}>Reopen</button>
                  )}
                  {!isTask && step.status === "not_started" && (
                    <button type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => { setMenu(false); start(async () => { await cancelApproval(step.id); after(); }); }}>Cancel request</button>
                  )}
                  <button type="button" className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { if (!window.confirm(`Delete "${step.title}"?`)) return; setMenu(false); start(async () => { if (isTask) await deleteTask(step.id); else await deleteApproval(step.id); onClose(); router.refresh(); }); }}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={onClose} className="btn btn-ghost px-2" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${t.tint} ${t.text}`}><t.icon className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-tight text-slate-900">{step.title}</h3>
            <p className="text-sm text-slate-500">{t.label}</p>
          </div>
        </div>
        {step.description && <p className="prose-sm-plain px-4 pb-3">{step.description}</p>}

        <div className="mx-4 rounded-lg bg-slate-50 px-3 py-2.5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-600">
            <span>Progress</span>
            <span>{step.status === "completed" ? "1/1" : "0/1"}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            {step.assignee ? <Avatar name={step.assignee.name} color={step.assignee.color} size="md" /> : <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500">?</span>}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{step.assignee?.name ?? "Unassigned"}</p>
              <p className={`text-xs ${step.status === "in_progress" ? "text-sky-700" : step.status === "rejected" ? "text-red-600" : "text-slate-500"}`}>
                {STATUS_LABEL[step.status]}{step.status === "in_progress" ? "…" : ""}
                {step.due_date && open && <span className={isOverdue(step.due_date) ? " text-red-600" : ""}> · due {dueLabel(step.due_date)}</span>}
              </p>
            </div>
          </div>
          {step.file_id && (
            <a href={`/api/files/${step.file_id}`} download className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline"><Paperclip className="h-3 w-3" /> {step.file_name}</a>
          )}
          {step.decision_note && <p className="mt-2 text-xs text-slate-600"><span className="font-medium">Note:</span> {step.decision_note}</p>}
        </div>

        <div className="px-4 py-3">
          {isTask && open && (
            <div className="flex flex-wrap gap-2">
              {step.kind === "file_request" ? (
                <>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    const fd = new FormData();
                    for (const f of Array.from(files)) fd.append("files", f);
                    start(async () => { const r = await uploadFiles(workspaceId, {}, fd); if (r.ok) await setTaskStatus(step.id, "done"); after(); });
                  }} />
                  <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className="btn btn-primary btn-sm">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload file</button>
                </>
              ) : (
                <button type="button" disabled={pending} onClick={() => start(async () => { await setTaskStatus(step.id, "done"); after(); })} className="btn btn-primary btn-sm">
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {step.kind === "acknowledgement" ? "Acknowledge" : "Mark complete"}
                </button>
              )}
              {step.kind !== "file_request" && step.status === "not_started" && (
                <button type="button" disabled={pending} onClick={() => start(async () => { await setTaskStatus(step.id, "in_progress"); after(); })} className="btn btn-secondary btn-sm">Start</button>
              )}
            </div>
          )}
          {canDecide && (
            <div className="space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} className="input py-1.5 text-sm" placeholder="Add a note (optional)" />
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => { const fd = new FormData(); fd.set("decision", "approved"); fd.set("note", note); start(async () => { await decideApproval(step.id, fd); after(); }); }} className="btn btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700"><ThumbsUp className="h-3.5 w-3.5" /> Approve</button>
                <button type="button" disabled={pending} onClick={() => { const fd = new FormData(); fd.set("decision", "rejected"); fd.set("note", note); start(async () => { await decideApproval(step.id, fd); after(); }); }} className="btn btn-secondary btn-sm text-red-600"><ThumbsDown className="h-3.5 w-3.5" /> Reject</button>
              </div>
            </div>
          )}
        </div>

        <ul className="space-y-3 px-4 pb-4">
          {activity.map((m) => (
            <li key={m.id} className="flex gap-2.5">
              {m.kind === "system" ? (
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-indigo-500" />
              ) : (
                <Avatar name={m.user_name ?? "?"} color={m.user_color} size="sm" className="mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-slate-800">
                  {m.kind === "system" ? <><span className="font-medium">{m.user_name ?? "System"}</span> {m.body}.</> : <><span className="font-medium">{m.user_name}</span>: {m.body}</>}
                  {m.file_id && <a href={`/api/files/${m.file_id}`} download className="ml-1 inline-flex items-center gap-1 text-indigo-700 hover:underline"><Paperclip className="h-3 w-3" />{m.file_name}</a>}
                </p>
                <p className="text-xs text-slate-400">{formatDateTime(m.created_at)}</p>
              </div>
            </li>
          ))}
          {activity.length === 0 && <li className="text-xs text-slate-400">No activity yet.</li>}
        </ul>
      </div>

      <div className="border-t border-slate-100 p-3">
        {attachment && <p className="mb-1 truncate text-xs text-slate-500"><Paperclip className="mr-1 inline h-3 w-3" />{attachment.name}</p>}
        <div className="flex items-center gap-2">
          <input ref={attachRef} type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => attachRef.current?.click()} className="btn btn-ghost px-2" title="Attach a file"><Paperclip className="h-4 w-4" /></button>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendComment(); } }}
            placeholder="Write a comment…"
            className="input"
            aria-label="Write a comment"
          />
          <button type="button" onClick={sendComment} disabled={pending || (!comment.trim() && !attachment)} className="btn btn-primary px-2.5" aria-label="Send comment"><Send className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
