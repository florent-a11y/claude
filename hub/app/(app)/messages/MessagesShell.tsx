"use client";

import { usePathname } from "next/navigation";

/** Two panes on desktop; on phones the list and the thread take turns. */
export function MessagesShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname !== "/messages";
  return (
    <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-[18rem_1fr] lg:grid-cols-[20rem_1fr]">
      <aside className={`${inThread ? "hidden md:block" : ""}`}>{list}</aside>
      <section className={`min-w-0 ${inThread ? "" : "hidden md:block"}`}>{children}</section>
    </div>
  );
}
