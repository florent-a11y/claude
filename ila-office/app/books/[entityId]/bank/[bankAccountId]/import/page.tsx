import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { NEW_GL } from "@/lib/bank-sections";
import { fmtDateTime } from "@/lib/dates";
import { Card, CardTable, Cols, Dash } from "@/components/ui";
import { base, requireEntity } from "../../../shared";
import { StatementImport } from "./StatementImport";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ entityId: string; bankAccountId: string }> }) {
  await requirePermission("books:write");
  const { entityId, bankAccountId } = await params;
  await requireEntity(entityId);
  const bank = await db.get("bank_accounts", bankAccountId);
  if (!bank || bank.entityId !== entityId) notFound();
  const batches = (await db.list("import_batches", { where: { entityId, kind: "bank_csv" }, orderBy: "createdAt", desc: true })).slice(0, 10);
  // A statement can carry several currencies: the screen sends each section to the bank account kept in that
  // currency, and can create the account (with a free bank GL account, or a new one) when the entity has none.
  const [banks, accounts] = await Promise.all([db.list("bank_accounts", { where: { entityId }, orderBy: "name" }), entityAccounts(entityId)]);
  const glOptions = [
    ...accounts.filter((a) => a.active && (a.subtype === "bank" || a.subtype === "cash") && !banks.some((x) => x.accountId === a.id)).sort((x, y) => x.code.localeCompare(y.code)).map((a) => ({ id: a.id, code: a.code, name: a.name })),
    { id: NEW_GL, code: "NEW", name: "Create a new GL account" },
  ];
  const b = base(entityId);
  const listHref = `${b}/bank/${bank.id}`;
  return (
    <div className="space-y-4 pb-8">
      <p className="text-xs text-ink-500"><Link href={`${b}/bank`} className="hover:underline">Bank</Link> / <Link href={listHref} className="hover:underline">{bank.name}</Link> / import</p>
      <h2 className="text-base font-semibold">Import statement into {bank.name} ({bank.currency})</h2>
      <StatementImport entityId={entityId} bankAccountId={bank.id} currency={bank.currency} bankName={bank.name} listHref={listHref} banks={banks.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, currency: x.currency, active: x.active }))} glOptions={glOptions} />
      {batches.length > 0 && (
        <Card title="Recent imports (all accounts of this entity)">
          <CardTable>
            <table className="table table-data min-w-[760px]">
              <Cols widths={[180, undefined, 80, 96, 90, 240]} />
              <thead><tr><th>When</th><th>File</th><th className="num">Rows</th><th className="num">Inserted</th><th className="num">Skipped</th><th>Errors</th></tr></thead>
              <tbody>
                {batches.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(x.createdAt)}</td>
                    <td><span className="cell" title={x.fileName}>{x.fileName}</span></td>
                    <td className="num">{x.rows}</td>
                    <td className="num">{x.inserted}</td>
                    <td className="num">{x.skipped}</td>
                    <td>{x.errors.length ? <span className="cell text-xs text-ink-500" title={x.errors.join("\n")}>{x.errors.length}: {x.errors[0]}</span> : <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        </Card>
      )}
    </div>
  );
}
