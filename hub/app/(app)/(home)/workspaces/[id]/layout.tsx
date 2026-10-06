import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { listMessages } from "@/lib/queries/messages";
import { Avatar } from "@/components/Avatar";
import { WorkspaceStatusBadge } from "@/components/Badge";
import { NavLink } from "@/components/NavLink";
import { Conversation } from "@/components/Conversation";
import { HexIcon } from "@/components/WorkspaceList";
import { formatDate, isOverdue } from "@/lib/format";
import { WorkspaceFrame } from "./WorkspaceFrame";
import { WorkspaceMenu } from "./WorkspaceMenu";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const members = listMembers(id);
  const team = members.filter((m) => m.role !== "client");
  const clients = members.filter((m) => m.role === "client");
  const base = `/workspaces/${id}`;
  const total = ws.open_tasks + ws.done_tasks + ws.pending_approvals + ws.decided_approvals;
  const done = ws.done_tasks + ws.decided_approvals;
  const color = ws.client_color ?? "#6366f1";

  const chat = (
    <>
      <div className="flex items-center border-b border-slate-200 px-4">
        <span className="tab tab-active px-1">Chat</span>
        <Link href={`${base}/members`} className="tab ml-5 px-1">Members</Link>
      </div>
      <div className="min-h-0 flex-1">
        <Conversation workspaceId={id} initial={listMessages(id, user)} me={{ id: user.id, name: user.name, color: user.color, role: user.role }} canInternal={isInternal(user)} />
      </div>
    </>
  );

  return (
    <WorkspaceFrame chat={chat}>
      <div className="relative h-36 md:h-44" style={{ background: `linear-gradient(120deg, ${color} 0%, #0f172a 140%)` }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, white 0, transparent 35%), radial-gradient(circle at 80% 70%, white 0, transparent 30%)" }} />
        <Link href="/" className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 md:hidden"><ArrowLeft className="h-3.5 w-3.5" /> Workspaces</Link>
      </div>
      <div className="px-6">
        <div className="-mt-9 mb-3"><HexIcon color={color} badge={total ? `${done}/${total}` : undefined} size={72} /></div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{ws.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {ws.client_name && (isInternal(user) ? <Link href={`/clients/${ws.client_id}`} className="hover:text-indigo-600">{ws.client_name}</Link> : <span>{ws.client_name}</span>)}
              <WorkspaceStatusBadge status={ws.status} />
              {ws.due_date && <span className={`inline-flex items-center gap-1 ${isOverdue(ws.due_date, ws.status === "completed") ? "text-red-600" : ""}`}><CalendarDays className="h-3.5 w-3.5" /> Due {formatDate(ws.due_date)}</span>}
            </p>
            {ws.description && <p className="mt-2 max-w-xl text-sm text-slate-600">{ws.description}</p>}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href={`${base}/members`} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50" title="Members">
            <span className="flex -space-x-1.5">{team.map((m) => <Avatar key={m.id} name={m.name} color={m.color} size="md" className="ring-2 ring-white" />)}</span>
            {clients.length > 0 && (
              <>
                <span className="h-7 w-px bg-slate-200" />
                <span className="flex -space-x-1.5">{clients.map((m) => <Avatar key={m.id} name={m.name} color={m.color} size="md" className="ring-2 ring-white" />)}</span>
              </>
            )}
          </Link>
          <WorkspaceMenu workspaceId={id} internal={isInternal(user)} />
        </div>
        <nav className="mt-4 flex border-b border-slate-200">
          <NavLink href={base} exact className="tab flex-1 justify-center px-2" activeClassName="tab-active">Flow</NavLink>
          <NavLink href={`${base}/files`} className="tab flex-1 justify-center px-2" activeClassName="tab-active">Files</NavLink>
        </nav>
      </div>
      <div>{children}</div>
    </WorkspaceFrame>
  );
}
