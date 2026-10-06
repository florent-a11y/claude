import { Layers } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { SectionShell, SideNav } from "@/components/SideNav";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  await requireInternal();
  return (
    <SectionShell nav={<SideNav groups={[{ title: "Templates", items: [{ href: "/templates", label: "Flow Workspace", icon: Layers }] }]} />}>
      {children}
    </SectionShell>
  );
}
