import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, ROLE_LABELS } from "@/lib/types";
import { Page, Card, CardTable, Cols, Dash, Field, Select, Badge } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { createUser, resetPassword, setUserActive, setUserEntities, setUserRole } from "../actions";
import { fmtDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function Users() {
  await requirePermission("admin");
  const [users, entities] = await Promise.all([db.list("users", { orderBy: "name" }), db.list("entities", { where: (e) => !e.isOwn && e.status !== "closed", orderBy: "name" })]);
  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? "(removed)";
  const allocation = (ids: string[] = []) => (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
      {entities.length === 0 && <p className="text-xs text-ink-500">No client entity yet.</p>}
      {entities.map((e) => <label key={e.id} className="flex items-center gap-2"><input type="checkbox" name="entityIds" value={e.id} defaultChecked={ids.includes(e.id)} className="checkbox" /> {e.name}</label>)}
    </div>
  );
  return (
    <Page title="Users" subtitle="ILA's team (admin, consultant, accountant / tax team, viewer) sees every company. A client user sees only the companies allocated to it, read-only.">
      <Card title="Team and client logins">
        <CardTable>
          <table className="table table-data min-w-[1000px]">
            <Cols widths={[undefined, 230, 260, 110, 90, 150]} />
            <thead><tr><th>Name</th><th>Role</th><th>Access</th><th>Last login</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const [loginDate, loginTime] = u.lastLoginAt ? fmtDateTime(u.lastLoginAt).split(", ") : [];
                const ids = u.entityIds ?? [];
                return (
                  <tr key={u.id} className={u.active ? "" : "row-muted"}>
                    <td>
                      <span className="cell-primary" title={u.name}>{u.name}</span>
                      <span className="cell-sub" title={u.email}>{u.email}</span>
                    </td>
                    <td>
                      <form action={setUserRole.bind(null, u.id)} className="flex items-center gap-1">
                        <Select name="role" defaultValue={u.role} options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label.split(" (")[0] }))} className="input !py-1 text-xs" />
                        <button className="btn-secondary !px-2 !py-1 text-xs">Save</button>
                      </form>
                    </td>
                    <td>
                      {u.role !== "client" ? <span className="text-xs text-ink-500">All companies</span> : (
                        <details>
                          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs [&::-webkit-details-marker]:hidden">
                            {ids.length === 0 ? <span className="text-amber-700">No company allocated</span> : <span className="cell" title={ids.map(entityName).join(", ")}>{ids.length === 1 ? entityName(ids[0]) : `${ids.length} companies`}</span>}
                            <span className="ml-1 text-brand-600 hover:underline">change</span>
                          </summary>
                          <form action={setUserEntities.bind(null, u.id)} className="mt-2 space-y-2 whitespace-normal">
                            {allocation(ids)}
                            <button className="btn-secondary !px-2 !py-1 text-xs">Save access</button>
                          </form>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{loginDate ? <>{loginDate}<span className="cell-sub">{loginTime}</span></> : <Dash />}</td>
                    <td><Badge tone={u.active ? "green" : "red"}>{u.active ? "active" : "disabled"}</Badge></td>
                    <td className="text-xs">
                      <ConfirmForm action={setUserActive.bind(null, u.id, !u.active)} message={u.active ? `Disable ${u.name}?` : `Re-enable ${u.name}?`}><button className="text-brand-600 hover:underline">{u.active ? "Disable" : "Enable"}</button></ConfirmForm>
                      <details className="mt-0.5"><summary className="cursor-pointer text-brand-600 hover:underline">Reset password</summary>
                        <form action={resetPassword.bind(null, u.id)} className="mt-1 space-y-1"><input name="password" type="password" minLength={10} required placeholder="new password" className="input !px-2 !py-1 text-xs" /><button className="btn-secondary !px-2 !py-1 text-xs">Set</button></form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
      </Card>
      <Card title="Add a user" className="mt-4">
        <form action={createUser} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Name"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Role" hint="Team roles see every company. Pick Client for a customer login."><Select name="role" defaultValue="consultant" options={ROLE_OPTIONS} /></Field>
            <Field label="Temporary password" hint="At least 10 characters; the user can change it later."><input name="password" type="password" minLength={10} required className="input" /></Field>
          </div>
          <div className="space-y-3">
            <div><span className="label">Companies a client user may see</span>{allocation()}<p className="mt-1 text-xs text-ink-500">Used only when the role is Client; the user then sees these companies' books, tax calendar and payroll, read-only.</p></div>
            <SubmitButton>Create user</SubmitButton>
          </div>
        </form>
      </Card>
    </Page>
  );
}
