import { Download, FileText, Lock } from "lucide-react";
import { Avatar } from "./Avatar";
import { formatBytes, formatTime } from "@/lib/format";
import type { Role } from "@/lib/types";

/** The fields a message needs to be drawn as a chat bubble (shared by workspace conversations and direct messages). */
export interface BubbleMessage {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_color: string | null;
  user_role: Role | null;
  body: string;
  internal?: number;
  file_id: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  created_at: string;
}

export function MessageBubble({ m, mine }: { m: BubbleMessage; mine: boolean }) {
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
