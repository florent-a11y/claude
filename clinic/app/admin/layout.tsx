import type { Metadata } from "next";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/manrope";
import "../globals.css";
import { site } from "@/lib/config";
import { staff } from "@/lib/admin";
import { databaseConfigured } from "@/lib/store";

/** Root layout for the console. English, no public header or footer, never indexed. */
export const metadata: Metadata = { title: "Console", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const who = await staff();
  return (
    <html lang="en">
      <body className="min-h-screen bg-sand-50">
        <header className="border-b border-sand-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <nav className="flex items-center gap-6 text-sm font-semibold text-forest-900">
              <a href="/admin" className="font-display text-2xl tracking-wide">{site.name} console</a>
              <a href="/admin" className="hover:underline">Orders</a>
              <a href="/admin/leads" className="hover:underline">Messages</a>
              <a href="/" className="font-normal text-ink-500 hover:underline">View site</a>
            </nav>
            <p className="text-sm text-ink-700">
              Signed in as <span className="font-semibold">{who.user}</span>{" "}
              <span className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${who.role === "doctor" ? "bg-clay-50 text-clay-600" : "bg-sage-100 text-forest-700"}`}>{who.role}</span>
            </p>
          </div>
          {!databaseConfigured() && (
            <p className="bg-clay-50 px-4 py-2 text-center text-xs font-medium text-clay-600">No database connected: orders are kept in a local file. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before taking real orders.</p>
          )}
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
