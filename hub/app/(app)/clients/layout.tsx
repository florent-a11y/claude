import { BarChart3, Building2, ListChecks, UserRound, Users } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { SectionShell, SideNav } from "@/components/SideNav";

export default async function CompaniesLayout({ children }: { children: React.ReactNode }) {
  await requireInternal();
  return (
    <SectionShell
      nav={
        <SideNav
          groups={[
            { title: "Reports", items: [
              { href: "/manage/workspaces", label: "Workspaces", icon: BarChart3 },
              { href: "/manage/actions", label: "Actions", icon: ListChecks },
              { href: "/manage/clients", label: "Clients", icon: UserRound },
              { href: "/manage/users", label: "Internal Users", icon: Users },
            ] },
            { title: "Directory", items: [{ href: "/clients", label: "Companies", icon: Building2 }] },
          ]}
        />
      }
    >
      {children}
    </SectionShell>
  );
}
