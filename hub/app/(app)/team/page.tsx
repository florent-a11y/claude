import { requireAdmin } from "@/lib/auth";
import { listAllClientUsers, listTeam } from "@/lib/queries/users";
import { setUserActive, setUserRole } from "@/lib/actions/team";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { NewMemberForm, ResetPasswordForm } from "./TeamForms";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const team = listTeam(true);
  const clients = listAllClientUsers();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Team" description="Who can sign in, and what they can do. Client contacts are created from each client's page." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionTitle>Internal team <span className="font-normal text-slate-400">({team.length})</span></SectionTitle>
            <ul className="card divide-y divide-slate-100">
              {team.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={u.name} color={u.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{u.name}</span>
                      {u.id === me.id && <Badge tone="indigo">You</Badge>}
                      {!u.active && <Badge tone="red">Deactivated</Badge>}
                    </div>
                    <p className="truncate text-xs text-slate-500">{u.title ? `${u.title} · ` : ""}{u.email}</p>
                  </div>
                  {u.id !== me.id ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <form action={setUserRole.bind(null, u.id, u.role === "admin" ? "member" : "admin")}>
                        <button className="btn btn-ghost btn-sm" type="submit">{u.role === "admin" ? "Administrator" : "Member"} · switch</button>
                      </form>
                      <ResetPasswordForm userId={u.id} userName={u.name} />
                      <form action={setUserActive.bind(null, u.id, !u.active)}>
                        <ConfirmButton message={u.active ? `Deactivate ${u.name}? They will be signed out immediately.` : `Reactivate ${u.name}?`} className={`btn btn-sm ${u.active ? "btn-ghost text-red-600" : "btn-secondary"}`}>
                          {u.active ? "Deactivate" : "Reactivate"}
                        </ConfirmButton>
                      </form>
                    </div>
                  ) : (
                    <Badge tone="slate">{u.role === "admin" ? "Administrator" : "Member"}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <SectionTitle>Client logins <span className="font-normal text-slate-400">({clients.length})</span></SectionTitle>
            <ul className="card divide-y divide-slate-100">
              {clients.length === 0 && <li className="px-4 py-4 text-sm text-slate-500">No client contacts yet.</li>}
              {clients.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={u.name} color={u.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{u.name}</span>
                    <p className="truncate text-xs text-slate-500">{u.client_name ?? "No company"} · {u.email}</p>
                  </div>
                  <ResetPasswordForm userId={u.id} userName={u.name} />
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="card h-fit p-4">
          <SectionTitle>Add a team member</SectionTitle>
          <NewMemberForm />
        </aside>
      </div>
    </div>
  );
}
