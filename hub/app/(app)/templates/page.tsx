import Link from "next/link";
import { Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { listTemplates } from "@/lib/queries/templates";
import { TemplateGrid } from "./TemplateGrid";

export const metadata = { title: "Library" };

export default async function TemplatesPage() {
  const user = await requireInternal();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Flow Workspace Templates</h1>
        <Link href="/templates/new" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Create</Link>
      </div>
      <TemplateGrid templates={listTemplates()} meName={user.name} />
    </>
  );
}
