"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Lock, Paperclip, Send, X } from "lucide-react";
import { MessageBubble, type BubbleMessage } from "./MessageBubble";
import { dayHeading, dayKey, formatBytes } from "@/lib/format";

export interface ThreadProps<M extends BubbleMessage> {
  initial: M[];
  meId: string;
  /** GET endpoint returning { messages } for ?after=<iso>. */
  pollUrl: string;
  send: (fd: FormData) => Promise<void>;
  /** Show the "internal note" toggle. */
  canInternal?: boolean;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  /** Custom rendering for special items (e.g. system lines). Return undefined to draw the default bubble. */
  renderItem?: (m: M, mine: boolean) => React.ReactNode | undefined;
  /** Called with messages that arrived from other people (e.g. to mark them read). */
  onIncoming?: (fresh: M[]) => void;
}

export function Thread<M extends BubbleMessage>({ initial, meId, pollUrl, send, canInternal = false, placeholder, emptyText, className = "", renderItem, onIncoming }: ThreadProps<M>) {
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef(initial.at(-1)?.created_at ?? "1970-01-01T00:00:00.000Z");
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function pull(): Promise<void> {
    const res = await fetch(`${pollUrl}?after=${encodeURIComponent(lastRef.current)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { messages: M[] };
    if (!data.messages.length) return;
    let incoming: M[] = [];
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = data.messages.filter((m) => !seen.has(m.id));
      if (!fresh.length) return prev;
      lastRef.current = fresh.at(-1)!.created_at;
      incoming = fresh.filter((m) => m.user_id !== meId);
      return [...prev, ...fresh];
    });
    if (incoming.length) incomingRef.current?.(incoming);
  }

  useEffect(() => {
    let stop = false;
    const tick = () => { if (!stop) void pull(); };
    const id = setInterval(tick, 4000);
    window.addEventListener("focus", tick);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollUrl]);

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
      try {
        await send(fd);
        await pull();
      } catch {
        setBody(sentBody);
        setFile(sentFile);
      }
    });
  }

  let lastDay = "";
  return (
    <div className={`card flex flex-col ${className || "h-[calc(100vh-15rem)] min-h-[28rem]"}`}>
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-16 text-center text-sm text-slate-500">{emptyText ?? "No messages yet. Say hello to kick things off."}</p>}
        {messages.map((m) => {
          const day = dayKey(m.created_at);
          const heading = day !== lastDay ? dayHeading(day) : null;
          lastDay = day;
          const mine = m.user_id === meId;
          const custom = renderItem?.(m, mine);
          return (
            <div key={m.id}>
              {heading && (
                <div className="my-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-100" />{heading}<span className="h-px flex-1 bg-slate-100" />
                </div>
              )}
              {custom !== undefined ? custom : <MessageBubble m={m} mine={mine} />}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div
        className={`border-t p-3 transition ${internal ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50/60"} ${dragOver ? "ring-2 ring-inset ring-indigo-400" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
      >
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
            placeholder={internal ? "Internal note — clients will not see this" : placeholder ?? "Write a message… (Enter to send, Shift+Enter for a new line)"}
            className="input flex-1 resize-none"
          />
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary px-2.5" title="Attach a file"><Paperclip className="h-4 w-4" /></button>
          <button type="button" onClick={submit} disabled={pending || (!body.trim() && !file)} className="btn btn-primary px-3" aria-label="Send"><Send className="h-4 w-4" /></button>
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
