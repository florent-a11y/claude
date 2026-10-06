"use client";

import { usePathname } from "next/navigation";

/** Three panes on desktop (list | workspace | chat). On phones the list shows at / and /summary, the content elsewhere. */
export function HomeShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const showList = pathname === "/" || pathname === "/summary";
  const full = /\/workspaces\/[^/]+\/(build|settings)$/.test(pathname) || pathname === "/workspaces/new";
  return (
    <div className="flex gap-3 px-3 py-3 md:px-4">
      <aside className={`w-full shrink-0 md:w-[19rem] lg:w-[21rem] ${showList ? "" : "hidden"} ${full ? "" : "md:block"}`}>{list}</aside>
      <section className={`min-w-0 flex-1 ${showList ? "hidden md:block" : ""}`}>{children}</section>
    </div>
  );
}
