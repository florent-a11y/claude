import type { Metadata } from "next";
import "../globals.css";

/** Root layout for the ops console. Unlocalized (English), no public header/footer, never indexed. */
export const metadata: Metadata = { title: "Ops console", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
