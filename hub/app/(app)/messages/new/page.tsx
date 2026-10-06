import { requireUser } from "@/lib/auth";
import { listMessageableUsers } from "@/lib/queries/dm";
import { NewConversationForm } from "./NewConversationForm";

export const metadata = { title: "New message" };

export default async function NewMessagePage() {
  const user = await requireUser();
  return <NewConversationForm people={listMessageableUsers(user)} />;
}
