import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { listClients } from "@/lib/queries/clients";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceCard } from "@/components/WorkspaceCard";
import { EmptyState } from "@/components/EmptyState";
import type { WorkspaceStatus } from "@/lib/types";

export const metadata = { title: "Workspaces" };

const FILTERS: { key: WorkspaceStatus | "open" | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ status?: string; client?: string; q?: string; mine?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = (FILTERS.find((f) => f.key === sp.status)?.key ?? "open") as WorkspaceStatus | "open" | "all";
  const internal = isInternal(user);
  const workspaces = listWorkspaces(user, { status, clientId: sp.client, q: sp.q, mine: sp.mine === "1" });
  const clients = internal ? listClients() : [];

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, client: sp.client, q: sp.q, mine: sp.mine, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/workspaces${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Workspaces"
        description={internal ? "One workspace per project or engagement. Clients only see the workspaces they are part of." : "The projects you are part of."}
        actions={internal && <Link href="/workspaces/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New workspace</Link>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={link({ status: f.key })} className={`rounded-md px-2.5 py-1 text-xs font-medium ${status === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              {f.label}
            </Link>
          ))}
        </div>
        {internal && (
          <form className="flex flex-wrap items-center gap-2" action="/workspaces">
            <input type="hidden" name="status" value={status} />
            <select name="client" defaultValue={sp.client ?? ""} className="input w-auto py-1.5 text-xs">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="rounded border-slate-300" /> Only mine
            </label>
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search…" className="input w-40 py-1.5 text-xs" />
            <button className="btn btn-secondary btn-sm" type="submit">Filter</button>
          </form>
        )}
      </div>
      {workspaces.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workspaces.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
      ) : (
        <EmptyState
          icon={Briefcase}
          title="No workspaces match"
          hint={internal ? "Create a workspace for each project. Add the client contacts so they can follow along." : "You have not been added to a workspace with this status."}
          action={internal && <Link href="/workspaces/new" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New workspace</Link>}
        />
      )}
    </div>
  );
}
