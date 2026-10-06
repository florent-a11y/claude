import { notFound } from "next/navigation";
import { MessageSquare, UserMinus, UserPlus } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { listActiveUsers } from "@/lib/queries/users";
import { addMember, removeMember } from "@/lib/actions/workspaces";
import { startDirect } from "@/lib/actions/dm";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";

export const metadata = { title: "Members" };

export default async function WorkspaceMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const internal = isInternal(user);
  const members = listMembers(id);
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = internal ? listActiveUsers().filter((u) => !memberIds.has(u.id)) : [];
  const team = members.filter((m) => m.role !== "client");
  const clients = members.filter((m) => m.role === "client");

  const Group = ({ title, people }: { title: string; people: typeof members }) => (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{title} <span className="font-normal text-slate-400">({people.length})</span></h2>
      <ul className="card divide-y divide-slate-100">
        {people.length === 0 && <li className="px-4 py-4 text-sm text-slate-500">Nobody yet.</li>}
        {people.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={m.name} color={m.color} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-900">{m.name}</span>
                {m.id === ws.owner_id && <Badge tone="indigo">Owner</Badge>}
                {!m.active && <Badge tone="red">Deactivated</Badge>}
              </div>
              <p className="truncate text-xs text-slate-500">{m.title || roleLabel(m.role)}{m.client_name ? ` · ${m.client_name}` : ""} · {m.email}</p>
            </div>
            {m.id !== user.id && m.active ? (
              <form action={startDirect.bind(null, m.id)}>
                <button className="btn btn-ghost btn-sm" title={`Message ${m.name}`}><MessageSquare className="h-3.5 w-3.5" /> Message</button>
              </form>
            ) : null}
            {internal && m.id !== user.id && (
              <form action={removeMember.bind(null, id, m.id)}>
                <ConfirmButton message={`Remove ${m.name} from this workspace?`} className="btn btn-ghost btn-sm text-slate-500 hover:text-red-600"><UserMinus className="h-3.5 w-3.5" /> Remove</ConfirmButton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="grid gap-6 px-5 pb-6 pt-4 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Group title="Team" people={team} />
        <Group title="Client contacts" people={clients} />
      </div>
      {internal && (
        <aside className="card h-fit p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Add a member</h2>
          <p className="mb-3 text-xs text-slate-500">Team members see everything. Client contacts see only what is not marked internal.</p>
          {candidates.length ? (
            <form action={addMember.bind(null, id)} className="space-y-2">
              <select name="user_id" className="input" required defaultValue="">
                <option value="" disabled>Choose a person…</option>
                <optgroup label="Team">
                  {candidates.filter((u) => u.role !== "client").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </optgroup>
                <optgroup label="Client contacts">
                  {candidates.filter((u) => u.role === "client").map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </optgroup>
              </select>
              <button className="btn btn-primary btn-sm w-full" type="submit"><UserPlus className="h-3.5 w-3.5" /> Add to workspace</button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Everyone is already in this workspace.</p>
          )}
          <p className="mt-3 text-xs text-slate-400">Need a new client login? Create it from the client page.</p>
        </aside>
      )}
    </div>
  );
}
