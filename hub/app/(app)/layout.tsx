import { requireUser } from "@/lib/auth";
import { countUnread } from "@/lib/queries/notifications";
import { countUnreadConversations } from "@/lib/queries/dm";
import { APP_NAME, ORG_NAME } from "@/lib/config";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = { unread: countUnread(user.id), messages: countUnreadConversations(user.id) };
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopNav user={user} counts={counts} appName={APP_NAME} orgName={ORG_NAME} logoUrl={process.env.NEXT_PUBLIC_LOGO_URL || undefined} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
