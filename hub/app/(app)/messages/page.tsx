import Link from "next/link";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function MessagesHome() {
  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[24rem] items-center">
      <div className="w-full">
        <EmptyState
          icon={MessageSquare}
          title="Your direct messages"
          hint="Pick a conversation on the left, or start one with a colleague or a client contact. Project discussions belong in the workspace conversation; this is for everything else."
          action={<Link href="/messages/new" className="btn btn-primary btn-sm"><MessageSquarePlus className="h-4 w-4" /> New message</Link>}
        />
      </div>
    </div>
  );
}
