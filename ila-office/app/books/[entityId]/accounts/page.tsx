import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { accountBalances, naturalBalance } from "@/lib/balances";
import { entityAccounts, entityEntries } from "@/lib/books";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from "@/lib/ledger";
import { ACCOUNT_SUBTYPES } from "@/lib/types";
import { Card, Badge, Money, Field, Select, CardTable, Cols, Dash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { createAccountAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Accounts({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const [accounts, entries] = await Promise.all([entityAccounts(entityId), entityEntries(entityId)]);
  const bal = accountBalances(entries);
  const showInactive = first(sp.inactive) === "1";
  const b = base(entityId);
  const writable = can(user, "books:write");
  const groups = ACCOUNT_TYPE_ORDER.map((type) => ({ type, rows: accounts.filter((a) => a.type === type && (showInactive || a.active)).sort((x, y) => x.code.localeCompare(y.code)) }));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{accounts.filter((a) => a.active).length} active accounts · balances from posted entries, natural sign.</p>
        <div className="flex gap-3 text-xs"><Link href={`${b}/accounts${showInactive ? "" : "?inactive=1"}`} className="text-brand-600 underline">{showInactive ? "Hide inactive" : "Show inactive"}</Link><Link href={`/api/books/${entityId}/reports/accounts`} className="text-brand-600 underline">Export CSV</Link></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {groups.map((g) => (
            <Card key={g.type} title={`${ACCOUNT_TYPE_LABELS[g.type]} (${g.rows.length})`}>
              <CardTable>
                <table className="table table-data min-w-[720px]">
                  <Cols widths={[84, undefined, 128, 150, 140, 56]} />
                  <thead><tr><th>Code</th><th>Name</th><th>Subtype</th><th>Tag</th><th className="num">Balance</th><th></th></tr></thead>
                  <tbody>
                    {g.rows.map((a) => (
                      <tr key={a.id} className={a.active ? "" : "row-muted"}>
                        <td><span className="cell font-mono text-xs" title={a.code}>{a.code}</span></td>
                        <td>
                          <span className={a.active ? "cell-primary" : "cell font-medium"} title={a.nameId ? `${a.name} · ${a.nameId}` : a.name}><Link href={`${b}/accounts/${a.id}`} className="hover:underline">{a.name}</Link>{a.isSystem && <Badge className="ml-2 align-middle">system</Badge>}{!a.active && <Badge tone="red" className="ml-2 align-middle">inactive</Badge>}</span>
                          {a.nameId && <span className="cell-sub" title={a.nameId}>{a.nameId}</span>}
                        </td>
                        <td><span className="cell text-xs" title={a.subtype}>{a.subtype}</span></td>
                        <td>{a.taxTag ? <Badge tone="indigo" className="max-w-full"><span className="truncate" title={a.taxTag}>{a.taxTag}</span></Badge> : <Dash />}</td>
                        <td className="num"><Link href={`${b}/reports/general-ledger?accountId=${a.id}`} className="hover:underline"><Money amount={naturalBalance(a, bal.get(a.id))} className="money" /></Link></td>
                        <td className="text-right text-xs"><Link href={`${b}/accounts/${a.id}`} className="text-brand-600 underline">edit</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardTable>
            </Card>
          ))}
        </div>
        {writable && (
          <Card title="Add account" className="h-fit">
            <form action={createAccountAction.bind(null, entityId)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code" hint="e.g. 1-1120"><input name="code" className="input" required placeholder="1-1120" pattern="\d-\d{4}" /></Field>
                <Field label="Type"><Select name="type" defaultValue="expense" options={ACCOUNT_TYPE_ORDER.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))} /></Field>
              </div>
              <Field label="Name"><input name="name" className="input" required /></Field>
              <Field label="Nama (Bahasa Indonesia)"><input name="nameId" className="input" /></Field>
              <Field label="Subtype"><Select name="subtype" defaultValue="opex" options={[...ACCOUNT_SUBTYPES]} /></Field>
              <Field label="Tax tag (optional)" hint="Only when the tax module must find this account."><Select name="taxTag" defaultValue="" options={[{ value: "", label: "— none —" }, "ppn_output", "ppn_input", "pph21_payable", "pph23_payable", "pph26_payable", "pph4_2_payable", "pph25_prepaid", "pph23_prepaid", "pph22_prepaid", "cit_payable", "bpjs_payable", "local_tax_payable", "ar_trade", "ap_trade", "bank_default", "sales_default", "salary_expense", "bpjs_expense", "cit_expense", "retained_earnings", "current_earnings", "fx_gain", "fx_loss", "suspense"].map((t) => (typeof t === "string" ? { value: t, label: t } : t))} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="deductible" defaultChecked className="checkbox" /> Deductible for CIT (expenses)</label>
              <SubmitButton>Add account</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
