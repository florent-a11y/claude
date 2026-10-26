import type { ReactNode } from "react";
import { isClient, requireUser } from "@/lib/auth";
import { ClientsTabs } from "./_components/ClientsTabs";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <>
      {!isClient(user) && <ClientsTabs />}
      {children}
    </>
  );
}
