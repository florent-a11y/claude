import { isInternal, requireUser } from "@/lib/auth";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { WorkspaceList } from "@/components/WorkspaceList";
import { HomeShell } from "./HomeShell";

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspaces = listWorkspaces(user, { status: "all" });
  return <HomeShell list={<WorkspaceList workspaces={workspaces} canCreate={isInternal(user)} />}>{children}</HomeShell>;
}
