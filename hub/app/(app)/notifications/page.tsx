import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/queries/notifications";
import { markAllRead, markRead } from "@/lib/actions/notifications";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = listNotifications(user.id);
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You are up to date."}
        actions={unread > 0 && <form action={markAllRead}><button className="btn btn-secondary btn-sm"><CheckCheck className="h-3.5 w-3.5" /> Mark all as read</button></form>}
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" hint="You will be notified about messages, tasks, files and approvals in your workspaces." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-indigo-50/40"}`}>
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-indigo-500"}`} />
              <form action={markRead.bind(null, n.id)} className="min-w-0 flex-1">
                <Link href={n.href} className="block">
                  <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-slate-600">{n.body}</span>}
                  <span className="block text-xs text-slate-400">{timeAgo(n.created_at)}</span>
                </Link>
                {!n.read && <button type="submit" className="mt-1 text-xs text-indigo-600 hover:underline">Mark as read</button>}
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
