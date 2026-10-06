import Link from "next/link";
import { LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { listTemplates, parseSteps } from "@/lib/queries/templates";
import { deleteTemplate } from "@/lib/actions/templates";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Badge } from "@/components/Badge";

export const metadata = { title: "Flows" };

export default async function TemplatesPage() {
  await requireInternal();
  const templates = listTemplates();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Flows"
        description="Reusable checklists of tasks, file requests and approvals. Apply one to a workspace to create every step in seconds."
        actions={<Link href="/templates/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New flow</Link>}
      />
      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No flows yet" hint="Turn the engagements you repeat (incorporations, visas, monthly bookkeeping…) into flows so nothing is forgotten." action={<Link href="/templates/new" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New flow</Link>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => {
            const steps = parseSteps(t.steps);
            return (
              <div key={t.id} className="card flex flex-col p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Link href={`/templates/${t.id}`} className="text-sm font-semibold text-slate-900 hover:text-indigo-700">{t.name}</Link>
                  <Badge>{t.step_count} steps</Badge>
                </div>
                {t.description && <p className="mb-2 text-xs text-slate-500">{t.description}</p>}
                <ol className="mb-3 space-y-0.5 text-xs text-slate-600">
                  {steps.slice(0, 5).map((s, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-4 text-right text-slate-400">{i + 1}.</span>
                      <span className="truncate">{s.title}</span>
                      <span className="text-slate-400">· {s.type === "file_request" ? "file" : s.type}{s.due_in_days != null && s.type !== "message" ? ` · ${s.due_in_days}d` : ""}</span>
                    </li>
                  ))}
                  {steps.length > 5 && <li className="pl-5 text-slate-400">+{steps.length - 5} more</li>}
                </ol>
                <div className="mt-auto flex items-center justify-between">
                  <Link href={`/templates/${t.id}`} className="btn btn-secondary btn-sm">Edit</Link>
                  <form action={deleteTemplate.bind(null, t.id)}>
                    <ConfirmButton message={`Delete the flow "${t.name}"? Workspaces that already used it are not affected.`} className="btn btn-ghost btn-sm px-2 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
