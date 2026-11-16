import type { ReactNode } from "react";
import { requireTeam } from "@/lib/auth";
import { VisibilityTabs } from "./_components/VisibilityTabs";

export const dynamic = "force-dynamic";

/** AI visibility: how often ChatGPT, Claude, Gemini and Perplexity name ILA when prospects ask. Team only. */
export default async function VisibilityLayout({ children }: { children: ReactNode }) {
  await requireTeam();
  return <><VisibilityTabs />{children}</>;
}
