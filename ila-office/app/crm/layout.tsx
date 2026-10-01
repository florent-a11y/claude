import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { CrmTabs } from "./_components/CrmTabs";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <CrmTabs />
      {children}
    </>
  );
}
