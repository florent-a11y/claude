import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogOut, UserPlus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getConversationForUser, listDirectMessages, listMessageableUsers } from "@/lib/queries/dm";
import { addToGroup, leaveGroup, renameGroup } from "@/lib/actions/dm";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { ConfirmButton } from "@/components/ConfirmButton";
import { roleLabel } from "@/components/Sidebar";
import { DirectThread } from "@/components/DirectThread";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const conv = getConversationForUser(id, user.id);
  if (!conv) notFound();
  const others = conv.members.filter((m) => m.id !== user.id);
  const other = conv.kind === "direct" ? others[0] : undefined;
  const candidates = conv.kind === "group" ? listMessageableUsers(user).filter((u) => !conv.members.some((m) => m.id === u.id)) : [];

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Link href="/messages" className="btn btn-ghost btn-sm px-2 md:hidden" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
        {other ? <Avatar name={other.name} color={other.color} size="md" /> : <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Users className="h-4 w-4" /></span>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-900">{conv.display_name}</h1>
          <p className="truncate text-xs text-slate-500">
            {other ? `${other.title ? `${other.title} · ` : ""}${other.client_name ?? roleLabel(other.role)}` : `${conv.members.length} members · ${conv.members.map((m) => m.name.split(" ")[0]).join(", ")}`}
          </p>
        </div>
        {conv.kind === "group" && (
          <details className="relative">
            <summary className="btn btn-secondary btn-sm cursor-pointer list-none"><AvatarStack people={conv.members} max={3} /> Group</summary>
            <div className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <form action={renameGroup.bind(null, id)} className="flex gap-1">
                <input name="title" defaultValue={conv.title} placeholder="Group name" className="input py-1.5 text-xs" />
                <button className="btn btn-secondary btn-sm">Rename</button>
              </form>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {conv.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2"><Avatar name={m.name} color={m.color} size="xs" /><span className="truncate">{m.name}</span><span className="ml-auto text-xs text-slate-400">{m.role === "client" ? m.client_name ?? "Client" : "Team"}</span></li>
                ))}
              </ul>
              {candidates.length > 0 && (
                <form action={addToGroup.bind(null, id)} className="flex gap-1">
                  <select name="user_id" className="input py-1.5 text-xs" defaultValue="" required>
                    <option value="" disabled>Add a person…</option>
                    {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}{u.client_name ? ` (${u.client_name})` : ""}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-sm" aria-label="Add"><UserPlus className="h-3.5 w-3.5" /></button>
                </form>
              )}
              <form action={leaveGroup.bind(null, id)}>
                <ConfirmButton message="Leave this group chat?" className="btn btn-ghost btn-sm w-full text-red-600"><LogOut className="h-3.5 w-3.5" /> Leave group</ConfirmButton>
              </form>
            </div>
          </details>
        )}
      </div>
      <DirectThread conversationId={id} initial={listDirectMessages(id)} meId={user.id} firstName={other ? other.name.split(" ")[0]! : "the group"} />
    </div>
  );
}
