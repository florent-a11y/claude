import Link from "next/link";
import { MessageSquarePlus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listConversations } from "@/lib/queries/dm";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { NavLink } from "@/components/NavLink";
import { timeAgo } from "@/lib/format";
import { MessagesShell } from "./MessagesShell";

export const metadata = { title: "Messages" };

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const conversations = listConversations(user.id);
  const list = (
    <div className="card flex h-[calc(100vh-9rem)] min-h-[24rem] flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <h1 className="text-sm font-semibold text-slate-900">Messages</h1>
        <Link href="/messages/new" className="btn btn-primary btn-sm"><MessageSquarePlus className="h-3.5 w-3.5" /> New</Link>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">No conversations yet.</li>}
        {conversations.map((c) => {
          const others = c.members.filter((m) => m.id !== user.id);
          const sub = c.kind === "direct" ? (others[0]?.client_name ?? others[0]?.title ?? "") : others.map((m) => m.name.split(" ")[0]).join(", ");
          return (
            <li key={c.id}>
              <NavLink href={`/messages/${c.id}`} className="mx-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-50" activeClassName="bg-indigo-50 hover:bg-indigo-50">
                {c.kind === "direct" && others[0] ? (
                  <Avatar name={others[0].name} color={others[0].color} size="md" />
                ) : (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Users className="h-4 w-4" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{c.display_name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${c.unread ? "text-slate-700" : "text-slate-500"}`}>
                      {c.last_body != null ? `${c.last_author === user.name ? "You" : (c.last_author ?? "").split(" ")[0]}: ${c.last_body || "Sent a file"}` : sub}
                    </span>
                    {c.unread > 0 && <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{c.unread}</span>}
                  </span>
                </span>
                {c.kind === "group" && <AvatarStack people={others} max={2} />}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return <MessagesShell list={list}>{children}</MessagesShell>;
}
