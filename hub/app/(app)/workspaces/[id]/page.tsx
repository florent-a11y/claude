import { notFound } from "next/navigation";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/queries/workspaces";
import { listMessages } from "@/lib/queries/messages";
import { Conversation } from "@/components/Conversation";

export default async function WorkspaceConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const messages = listMessages(id, user);
  return <Conversation workspaceId={id} initial={messages} me={{ id: user.id, name: user.name, color: user.color }} canInternal={isInternal(user)} />;
}
