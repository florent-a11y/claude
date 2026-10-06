import Link from "next/link";
import { Search } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { listClients } from "@/lib/queries/clients";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { WorkspaceCard } from "@/components/WorkspaceCard";
import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireInternal();
  const { q = "" } = await searchParams;
  const term = q.trim();
  const workspaces = term ? listWorkspaces(user, { status: "all", q: term }) : [];
  const clients = term ? listClients(term) : [];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={term ? `Results for “${term}”` : "Search"} description={term ? `${workspaces.length} workspaces · ${clients.length} clients` : "Type in the search box above."} />
      {term && !workspaces.length && !clients.length && <EmptyState icon={Search} title="Nothing found" hint="Try a shorter word, or the client's name." />}
      {clients.length > 0 && (
        <section className="mb-6">
          <SectionTitle>Clients</SectionTitle>
          <ul className="card divide-y divide-slate-100">
            {clients.map((c) => (
              <li key={c.id}><Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: c.color }}>{c.name[0]}</span>
                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                <span className="text-xs text-slate-500">{c.industry}</span>
                <span className="ml-auto text-xs text-slate-500">{c.active_workspaces} active workspaces</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}
      {workspaces.length > 0 && (
        <section>
          <SectionTitle>Workspaces</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workspaces.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
        </section>
      )}
    </div>
  );
}
