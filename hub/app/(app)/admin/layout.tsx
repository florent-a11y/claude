import { ArrowLeft, Building2, UserRound, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { SectionShell, SideNav } from "@/components/SideNav";
import { roleLabel } from "@/lib/format";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <SectionShell
      nav={
        <SideNav
          header={
            <div className="mb-5 flex items-center gap-3 px-3">
              <Avatar name={user.name} color={user.color} size="lg" />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{user.name}</span><span className="block text-xs text-slate-500">{roleLabel(user.role)}</span></span>
            </div>
          }
          groups={[
            { items: [
              { href: "/admin/users", label: "Internal Users", icon: Users },
              { href: "/admin/clients", label: "Clients", icon: UserRound },
              { href: "/clients", label: "Companies", icon: Building2 },
            ] },
            { items: [{ href: "/", label: "Business Portal", icon: ArrowLeft, exact: true }] },
          ]}
        />
      }
    >
      {children}
    </SectionShell>
  );
}
