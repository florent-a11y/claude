import { notFound } from "next/navigation";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/queries/workspaces";
import { listMessages } from "@/lib/queries/messages";
import { Conversation } from "@/components/Conversation";

export const metadata = { title: "Chat" };

/** Full-width chat for small screens (on large screens the chat sits beside the workspace). */
export default async function WorkspaceChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!getWorkspaceForUser(id, user)) notFound();
  return (
    <div className="h-[calc(100vh-24rem)] min-h-[20rem]">
      <Conversation workspaceId={id} initial={listMessages(id, user)} me={{ id: user.id, name: user.name, color: user.color, role: user.role }} canInternal={isInternal(user)} className="h-full border-0 shadow-none" />
    </div>
  );
}
