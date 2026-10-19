import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, Card, CardTable, Cols, Dash, Field, Select, Badge } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { createUser, resetPassword, setUserActive, setUserRole } from "../actions";
import { fmtDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };
const ROLES = ["admin", "consultant", "accountant", "viewer"];

export default async function Users() {
  await requirePermission("admin");
  const users = await db.list("users", { orderBy: "name" });
  return (
    <Page title="Users" subtitle="Admins manage everything. Consultants write the CRM; accountants write books, tax and payroll; viewers read.">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Team">
          <CardTable>
            <table className="table table-data min-w-[720px]">
              <Cols widths={[undefined, 190, 110, 90, 150]} />
              <thead><tr><th>Name</th><th>Role</th><th>Last login</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const [loginDate, loginTime] = u.lastLoginAt ? fmtDateTime(u.lastLoginAt).split(", ") : [];
                  return (
                    <tr key={u.id} className={u.active ? "" : "row-muted"}>
                      <td>
                        <span className="cell-primary" title={u.name}>{u.name}</span>
                        <span className="cell-sub" title={u.email}>{u.email}</span>
                      </td>
                      <td>
                        <form action={setUserRole.bind(null, u.id)} className="flex items-center gap-1">
                          <Select name="role" defaultValue={u.role} options={ROLES} className="input !w-28 !py-1 text-xs" />
                          <button className="btn-secondary !px-2 !py-1 text-xs">Save</button>
                        </form>
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
        <Card title="Add a user">
          <form action={createUser} className="space-y-3">
            <Field label="Name"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Role"><Select name="role" defaultValue="consultant" options={ROLES} /></Field>
            <Field label="Temporary password (10+ characters)"><input name="password" type="password" minLength={10} required className="input" /></Field>
            <SubmitButton>Create user</SubmitButton>
          </form>
        </Card>
      </div>
    </Page>
  );
}
