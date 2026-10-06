import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, Settings } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { countWorkspaceFiles } from "@/lib/queries/files";
import { AvatarStack } from "@/components/Avatar";
import { WorkspaceStatusBadge } from "@/components/Badge";
import { NavLink } from "@/components/NavLink";
import { formatDate, isOverdue } from "@/lib/format";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const members = listMembers(id);
  const files = countWorkspaceFiles(id, user);
  const base = `/workspaces/${id}`;
  const tabs = [
    { href: base, label: "Conversation", exact: true, count: 0 },
    { href: `${base}/tasks`, label: "Tasks", exact: false, count: ws.open_tasks },
    { href: `${base}/files`, label: "Files", exact: false, count: files },
    { href: `${base}/approvals`, label: "Approvals", exact: false, count: ws.pending_approvals },
    { href: `${base}/members`, label: "Members", exact: false, count: members.length },
  ];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Link href="/workspaces" className="hover:text-indigo-600">Workspaces</Link>
            {ws.client_name && (
              <>
                <span>/</span>
                {isInternal(user) ? (
                  <Link href={`/clients/${ws.client_id}`} className="inline-flex items-center gap-1 hover:text-indigo-600"><Building2 className="h-3 w-3" />{ws.client_name}</Link>
                ) : (
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{ws.client_name}</span>
                )}
              </>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{ws.name}</h1>
            <WorkspaceStatusBadge status={ws.status} />
            {ws.due_date && (
              <span className={`inline-flex items-center gap-1 text-xs ${isOverdue(ws.due_date, ws.status === "completed") ? "text-red-600" : "text-slate-500"}`}>
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(ws.due_date)}
              </span>
            )}
          </div>
          {ws.description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{ws.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Link href={`${base}/members`} title="Members"><AvatarStack people={members} max={5} /></Link>
          {isInternal(user) && (
            <Link href={`${base}/settings`} className="btn btn-secondary btn-sm"><Settings className="h-3.5 w-3.5" /> Settings</Link>
          )}
        </div>
      </div>
      <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink key={t.href} href={t.href} exact={t.exact} className="tab" activeClassName="tab-active">
            {t.label}
            {t.count > 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{t.count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
