import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Mail, MapPin, Phone, Plus, Trash2, UserX, UserCheck } from "lucide-react";
import { requireInternal } from "@/lib/auth";
import { getClient } from "@/lib/queries/clients";
import { listClientContacts } from "@/lib/queries/users";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { deleteClient } from "@/lib/actions/clients";
import { setUserActive } from "@/lib/actions/team";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { WorkspaceCard } from "@/components/WorkspaceCard";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ClientForm } from "../ClientForm";
import { ContactForm } from "./ContactForm";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireInternal();
  const client = getClient(id);
  if (!client) notFound();
  const contacts = listClientContacts(id);
  const workspaces = listWorkspaces(user, { status: "all", clientId: id });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={client.name}
        description={[client.industry, client.website].filter(Boolean).join(" · ")}
        actions={<Link href={`/workspaces/new?client=${id}`} className="btn btn-primary"><Plus className="h-4 w-4" /> New workspace</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionTitle>Workspaces <span className="font-normal text-slate-400">({workspaces.length})</span></SectionTitle>
            {workspaces.length ? (
              <div className="grid gap-3 sm:grid-cols-2">{workspaces.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
            ) : (
              <p className="card px-4 py-5 text-sm text-slate-500">No workspace for this client yet.</p>
            )}
          </section>
          <section className="card p-5">
            <SectionTitle>Company details</SectionTitle>
            <ClientForm client={client} />
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-4">
            <SectionTitle>Contacts <span className="font-normal text-slate-400">({contacts.length})</span></SectionTitle>
            {contacts.length ? (
              <ul className="-mx-4 divide-y divide-slate-100 border-y border-slate-100">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={c.name} color={c.color} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{c.name}</span>
                        {!c.active && <Badge tone="red">Deactivated</Badge>}
                      </div>
                      <p className="truncate text-xs text-slate-500">{c.title ? `${c.title} · ` : ""}{c.email}</p>
                    </div>
                    {user.role === "admin" && (
                      <form action={setUserActive.bind(null, c.id, !c.active)}>
                        <ConfirmButton message={c.active ? `Deactivate ${c.name}? They will no longer be able to sign in.` : `Reactivate ${c.name}?`} className="btn btn-ghost btn-sm px-2 text-slate-400 hover:text-slate-700">
                          {c.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </ConfirmButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-slate-500">No portal access yet.</p>
            )}
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Add a contact</h3>
              <ContactForm clientId={id} />
            </div>
          </section>
          <section className="card p-4 text-sm">
            <SectionTitle>At a glance</SectionTitle>
            <dl className="space-y-2 text-slate-600">
              {client.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><a href={`mailto:${client.email}`} className="hover:text-indigo-600">{client.email}</a></div>}
              {client.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{client.phone}</div>}
              {client.website && <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" /><a href={client.website} target="_blank" rel="noreferrer" className="truncate hover:text-indigo-600">{client.website}</a></div>}
              {client.address && <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-slate-400" />{client.address}</div>}
              {!client.email && !client.phone && !client.website && !client.address && <p className="text-slate-400">No contact details yet.</p>}
            </dl>
          </section>
          {user.role === "admin" && (
            <form action={deleteClient.bind(null, id)} className="text-right">
              <ConfirmButton message={`Delete ${client.name}? Workspaces are kept but unlinked; contacts keep their accounts.`} className="btn btn-danger btn-sm"><Trash2 className="h-3.5 w-3.5" /> Delete client</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
