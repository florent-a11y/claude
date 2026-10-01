import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { ClientsTabs } from "./_components/ClientsTabs";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <ClientsTabs />
      {children}
    </>
  );
}
