import Link from "next/link";
import type { ReactNode } from "react";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ShellNav } from "./ShellNav";

/** App frame: sidebar navigation + content. Rendered by app/layout.tsx for every signed-in page. */
export async function Shell({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (!user) return <>{children}</>;
  const entities = await db.list("entities", { where: (e) => e.status !== "closed", orderBy: "name" });
  const own = entities.find((e) => e.isOwn);
  const items = entities.map((e) => ({ id: e.id, name: e.name, isOwn: e.isOwn }));
  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-200 px-4 py-4">
          <Link href="/" className="block"><p className="text-[10px] font-semibold uppercase tracking-widest text-accent-600">ILA Global Consulting</p><p className="text-lg font-bold text-brand-700">ILA Office</p></Link>
        </div>
        <ShellNav entities={items} ownEntityId={own?.id} role={user.role} />
        <div className="mt-auto border-t border-slate-200 px-4 py-3 text-xs">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-ink-500">{user.email} · {user.role}</p>
          <form method="post" action="/api/auth/logout" className="mt-2"><button className="text-brand-600 underline">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 md:hidden">
          <Link href="/" className="font-bold text-brand-700">ILA Office</Link>
          <details className="relative">
            <summary className="btn-secondary !py-1 cursor-pointer list-none text-xs">Menu</summary>
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"><ShellNav entities={items} ownEntityId={own?.id} role={user.role} /></div>
          </details>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
