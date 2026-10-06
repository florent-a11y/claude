import { notFound } from "next/navigation";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { listWorkspaceTasks } from "@/lib/queries/tasks";
import { listWorkspaceApprovals } from "@/lib/queries/approvals";
import { listTemplates, parseSteps } from "@/lib/queries/templates";
import { toSteps } from "@/lib/steps";
import { StepsTimeline } from "@/components/StepsTimeline";

export default async function WorkspaceFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const internal = isInternal(user);
  const steps = toSteps(listWorkspaceTasks(id, user), listWorkspaceApprovals(id));
  const flows = internal ? listTemplates().map((t) => ({ id: t.id, name: t.name, steps: parseSteps(t.steps) })) : [];
  return (
    <StepsTimeline
      steps={steps}
      workspaceId={id}
      me={{ id: user.id, name: user.name, color: user.color, role: user.role }}
      canManage={internal}
      members={listMembers(id)}
      flows={flows}
      ownerId={ws.owner_id}
    />
  );
}
