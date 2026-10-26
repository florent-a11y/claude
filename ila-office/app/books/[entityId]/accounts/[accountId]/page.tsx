import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Field, DL, Badge } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { updateAccountAction, deleteAccountAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditAccount({ params, searchParams }: { params: Promise<{ entityId: string; accountId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, accountId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const account = await db.get("accounts", accountId);
  if (!account || account.entityId !== entityId) notFound();
  const writable = can(user, "books:write");
  const b = base(entityId);
  return (
    <div className="max-w-2xl space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <p className="text-xs text-ink-500"><Link href={`${b}/accounts`} className="hover:underline">Accounts</Link> / {account.code}</p>
      <Card title={`${account.code} · ${account.name}`} actions={<Link href={`${b}/reports/general-ledger?accountId=${account.id}`} className="text-xs text-brand-600 underline">General ledger</Link>}>
        <DL items={[["Type", account.type], ["Subtype", account.subtype], ["Normal balance", account.normalBalance], ["Tax tag", account.taxTag ? <Badge tone="indigo">{account.taxTag}</Badge> : "—"], ["System", account.isSystem ? "Yes (cannot be deleted or deactivated)" : "No"]]} />
      </Card>
      {writable && (
        <Card title="Edit">
          <form action={updateAccountAction.bind(null, entityId, accountId)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code"><input name="code" defaultValue={account.code} className="input" required pattern="\d-\d{4}" /></Field>
              <Field label="Name"><input name="name" defaultValue={account.name} className="input" required /></Field>
            </div>
            <Field label="Nama (Bahasa Indonesia)"><input name="nameId" defaultValue={account.nameId} className="input" /></Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={account.active} disabled={account.isSystem} className="checkbox" /> Active{account.isSystem && <input type="hidden" name="active" value="on" />}</label>
              {account.type === "expense" && <label className="flex items-center gap-2"><input type="hidden" name="deductibleShown" value="1" /><input type="checkbox" name="deductible" defaultChecked={account.deductible !== false} className="checkbox" /> Deductible for CIT</label>}
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton>Save</SubmitButton>
              {!account.isSystem && <ConfirmForm action={deleteAccountAction.bind(null, entityId, accountId)} message={`Delete account ${account.code}? Only possible when it has no journal lines.`}><button className="btn-danger" type="submit">Delete</button></ConfirmForm>}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
