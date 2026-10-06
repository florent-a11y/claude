import { requireInternal } from "@/lib/auth";
import { listClients } from "@/lib/queries/clients";
import { listAllClientUsers, listTeam } from "@/lib/queries/users";
import { listTemplates } from "@/lib/queries/templates";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceForm } from "./WorkspaceForm";

export const metadata = { title: "New workspace" };

export default async function NewWorkspacePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireInternal();
  const { client } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New workspace" description="A workspace holds the conversation, tasks, files and approvals of one project." />
      <div className="card p-6">
        <WorkspaceForm clients={listClients()} team={listTeam()} clientUsers={listAllClientUsers()} templates={listTemplates()} defaultClientId={client} />
      </div>
    </div>
  );
}
