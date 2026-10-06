import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { listClients } from "@/lib/queries/clients";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireInternal();
  const { q = "" } = await searchParams;
  const clients = listClients(q);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clients"
        description="Every company you work with, their contacts and their workspaces."
        actions={
          <>
            <form action="/clients"><input name="q" defaultValue={q} placeholder="Search clients…" className="input w-48 py-1.5 text-xs" /></form>
            <Link href="/clients/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New client</Link>
          </>
        }
      />
      {clients.length === 0 ? (
        <EmptyState icon={Building2} title={q ? "No client matches" : "No clients yet"} hint="Add a client company, then create its contacts so they can sign in to their portal." action={<Link href="/clients/new" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New client</Link>} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Industry</th>
                <th className="px-4 py-2.5 text-right">Contacts</th>
                <th className="px-4 py-2.5 text-right">Active workspaces</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-indigo-700">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: c.color }}>{c.name[0]}</span>
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.industry || "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.contact_count}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.active_workspaces}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{c.workspace_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
