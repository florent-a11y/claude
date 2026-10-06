"use client";

import { usePathname } from "next/navigation";

/** Centre column + chat column. The builder and settings get the full width. */
export function WorkspaceFrame({ chat, children }: { chat: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const full = /\/(build|settings|chat)$/.test(pathname);
  return (
    <div className="flex h-[calc(100vh-5.5rem)] gap-3">
      <section className="card min-w-0 flex-1 overflow-y-auto">{children}</section>
      {!full && <aside className="card hidden w-[22rem] shrink-0 flex-col lg:flex xl:w-[25rem]">{chat}</aside>}
    </div>
  );
}
