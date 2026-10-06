import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, Plus } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { EmptyState } from "@/components/EmptyState";

/** Home opens the most recently active workspace, like a messaging app. */
export default async function HomePage() {
  const user = await requireUser();
  const open = listWorkspaces(user, { status: "open" });
  if (open[0]) redirect(`/workspaces/${open[0].id}`);
  const any = listWorkspaces(user, { status: "all" });
  if (any[0]) redirect(`/workspaces/${any[0].id}`);
  return (
    <div className="flex h-[calc(100vh-7.5rem)] items-center">
      <div className="w-full">
        <EmptyState
          icon={Briefcase}
          title={isInternal(user) ? "No workspaces yet" : "No workspaces yet"}
          hint={isInternal(user) ? "Create a workspace for each client engagement. Its flow steps, files and chat live together." : "Your project team will add you to a workspace soon."}
          action={isInternal(user) && <Link href="/workspaces/new" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New workspace</Link>}
        />
      </div>
    </div>
  );
}
