import { requireUser } from "@/lib/auth";
import { countMyOpenTasks } from "@/lib/queries/tasks";
import { countApprovalsForMe } from "@/lib/queries/approvals";
import { countUnread } from "@/lib/queries/notifications";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = {
    tasks: countMyOpenTasks(user.id).open,
    approvals: countApprovalsForMe(user.id),
    unread: countUnread(user.id),
  };
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} counts={counts} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
