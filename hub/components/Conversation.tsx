"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Download, FileText, Lock, Paperclip, Send, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { postMessage } from "@/lib/actions/messages";
import { dayHeading, dayKey, formatBytes, formatTime } from "@/lib/format";
import type { MessageWithMeta } from "@/lib/types";

export function Conversation({ workspaceId, initial, me, canInternal }: {
  workspaceId: string;
  initial: MessageWithMeta[];
  me: { id: string; name: string; color: string };
  canInternal: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef(initial.at(-1)?.created_at ?? "1970-01-01T00:00:00.000Z");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/messages?after=${encodeURIComponent(lastRef.current)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: MessageWithMeta[] };
        if (stop || !data.messages.length) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          lastRef.current = fresh.at(-1)!.created_at;
          return [...prev, ...fresh];
        });
      } catch {
        /* offline; try again next tick */
      }
    };
    const id = setInterval(tick, 4000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [workspaceId]);

  function submit() {
    if ((!body.trim() && !file) || pending) return;
    const fd = new FormData();
    fd.set("body", body);
    if (internal) fd.set("internal", "on");
    if (file) fd.set("file", file);
    const sentBody = body;
    const sentFile = file;
    setBody("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    startTransition(async () => {
      await postMessage(workspaceId, fd);
      const res = await fetch(`/api/workspaces/${workspaceId}/messages?after=${encodeURIComponent(lastRef.current)}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        const data = (await res.json()) as { messages: MessageWithMeta[] };
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          if (fresh.length) lastRef.current = fresh.at(-1)!.created_at;
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } else {
        setBody(sentBody);
        setFile(sentFile);
      }
    });
  }

  let lastDay = "";
  return (
    <div className="card flex h-[calc(100vh-15rem)] min-h-[28rem] flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-16 text-center text-sm text-slate-500">No messages yet. Say hello to kick things off.</p>
        )}
        {messages.map((m) => {
          const day = dayKey(m.created_at);
          const heading = day !== lastDay ? dayHeading(day) : null;
          lastDay = day;
          return (
            <div key={m.id}>
              {heading && (
                <div className="my-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-100" />{heading}<span className="h-px flex-1 bg-slate-100" />
                </div>
              )}
              {m.kind === "system" ? (
                <SystemLine m={m} workspaceId={workspaceId} />
              ) : (
                <Bubble m={m} mine={m.user_id === me.id} />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className={`border-t p-3 ${internal ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50/60"}`}>
        {file && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" /> {file.name} <span className="text-slate-400">({formatBytes(file.size)})</span>
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-slate-400 hover:text-slate-700" aria-label="Remove attachment"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={internal ? "Internal note — clients will not see this" : "Write a message… (Enter to send, Shift+Enter for a new line)"}
            className="input flex-1 resize-none"
          />
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary px-2.5" title="Attach a file"><Paperclip className="h-4 w-4" /></button>
          <button type="button" onClick={submit} disabled={pending || (!body.trim() && !file)} className="btn btn-primary px-3"><Send className="h-4 w-4" /></button>
        </div>
        {canInternal && (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="rounded border-slate-300" />
            <Lock className="h-3 w-3" /> Internal note (hidden from clients)
          </label>
        )}
      </div>
    </div>
  );
}

function SystemLine({ m, workspaceId }: { m: MessageWithMeta; workspaceId: string }) {
  const href = m.ref_type === "task" ? `/workspaces/${workspaceId}/tasks` : m.ref_type === "approval" ? `/workspaces/${workspaceId}/approvals` : m.ref_type === "file" ? `/workspaces/${workspaceId}/files` : null;
  const content = (
    <>
      <span className="font-medium text-slate-600">{m.user_name ?? "System"}</span> {m.body}
      {!!m.internal && <Lock className="ml-1 inline h-3 w-3 text-amber-500" />}
      <span className="ml-2 text-slate-300">{formatTime(m.created_at)}</span>
    </>
  );
  return (
    <div className="py-1 text-center text-xs text-slate-400">
      {href ? <Link href={href} className="hover:text-indigo-600">{content}</Link> : content}
    </div>
  );
}

function Bubble({ m, mine }: { m: MessageWithMeta; mine: boolean }) {
  const name = m.user_name ?? "Unknown";
  return (
    <div className={`flex gap-2.5 py-1.5 ${mine ? "flex-row-reverse" : ""}`}>
      <Avatar name={name} color={m.user_color} size="sm" className="mt-1" />
      <div className={`max-w-[75%] ${mine ? "items-end text-right" : ""}`}>
        <div className={`mb-0.5 flex items-center gap-2 text-xs text-slate-500 ${mine ? "flex-row-reverse" : ""}`}>
          <span className="font-medium text-slate-700">{name}</span>
          {m.user_role === "client" && <span className="rounded bg-sky-50 px-1 text-[10px] text-sky-700">Client</span>}
          <span>{formatTime(m.created_at)}</span>
          {!!m.internal && <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800"><Lock className="h-2.5 w-2.5" /> Internal</span>}
        </div>
        {m.body && (
          <div className={`inline-block rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed whitespace-pre-wrap break-words ${
            m.internal ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200/70" : mine ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
          }`}>
            {m.body}
          </div>
        )}
        {m.file_id && (
          <a href={`/api/files/${m.file_id}`} className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-indigo-300" download>
            {m.file_mime?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${m.file_id}?inline=1`} alt={m.file_name ?? "image"} className="max-h-48 rounded-lg object-contain" />
            ) : (
              <>
                <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{m.file_name}</span>
                  <span className="block text-xs text-slate-500">{formatBytes(m.file_size ?? 0)}</span>
                </span>
                <Download className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
              </>
            )}
          </a>
        )}
      </div>
    </div>
  );
}
