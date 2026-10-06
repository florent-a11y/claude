import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/queries/workspaces";
import { listClients } from "@/lib/queries/clients";
import { listTeam } from "@/lib/queries/users";
import { deleteWorkspace } from "@/lib/actions/workspaces";
import { ConfirmButton } from "@/components/ConfirmButton";
import { WorkspaceSettingsForm } from "./WorkspaceSettingsForm";

export const metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireInternal();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  return (
    <div className="grid gap-6 px-5 pb-6 pt-4 lg:grid-cols-3">
      <div className="card p-5 lg:col-span-2">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Workspace details</h2>
        <WorkspaceSettingsForm ws={ws} clients={listClients()} team={listTeam()} />
      </div>
      {user.role === "admin" && (
        <aside className="card h-fit border-red-100 p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-700">Danger zone</h2>
          <p className="mb-3 text-xs text-slate-500">Deleting removes the conversation, tasks, files and approvals of this workspace. Prefer “Archived” status to keep the history.</p>
          <form action={deleteWorkspace.bind(null, id)}>
            <ConfirmButton message={`Permanently delete "${ws.name}" and everything in it?`} className="btn btn-danger btn-sm ring-1 ring-red-200"><Trash2 className="h-3.5 w-3.5" /> Delete workspace</ConfirmButton>
          </form>
        </aside>
      )}
    </div>
  );
}
