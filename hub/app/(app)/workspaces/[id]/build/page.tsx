import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { getTemplate, listTemplates, parseSteps } from "@/lib/queries/templates";
import { FlowBuilder } from "@/components/FlowBuilder";

export const metadata = { title: "Build project" };

export default async function BuildProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ flow?: string }> }) {
  const { id } = await params;
  const { flow } = await searchParams;
  const user = await requireInternal();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const flows = listTemplates().map((t) => ({ id: t.id, name: t.name, steps: parseSteps(t.steps) }));
  const start = flow ? getTemplate(flow) : undefined;
  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Drag steps into the order they should happen. Each one becomes a task, file request, approval or message in this workspace the moment you click create.
      </p>
      <FlowBuilder mode="workspace" workspaceId={id} workspaceName={ws.name} members={listMembers(id)} flows={flows} initialSteps={start ? parseSteps(start.steps) : []} />
    </div>
  );
}
