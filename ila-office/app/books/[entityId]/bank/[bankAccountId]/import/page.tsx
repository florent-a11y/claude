import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { Card } from "@/components/ui";
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
  const b = base(entityId);
  const listHref = `${b}/bank/${bank.id}`;
  return (
    <div className="space-y-4 pb-8">
      <p className="text-xs text-ink-500"><Link href={`${b}/bank`} className="hover:underline">Bank</Link> / <Link href={listHref} className="hover:underline">{bank.name}</Link> / import</p>
      <h2 className="text-base font-semibold">Import statement into {bank.name} ({bank.currency})</h2>
      <StatementImport entityId={entityId} bankAccountId={bank.id} currency={bank.currency} listHref={listHref} />
      {batches.length > 0 && (
        <Card title="Recent imports (all accounts of this entity)">
          <table className="table"><thead><tr><th>When</th><th>File</th><th className="num">Rows</th><th className="num">Inserted</th><th className="num">Skipped</th><th>Errors</th></tr></thead>
            <tbody>{batches.map((x) => <tr key={x.id}><td className="whitespace-nowrap">{fmtDateTime(x.createdAt)}</td><td>{x.fileName}</td><td className="num">{x.rows}</td><td className="num">{x.inserted}</td><td className="num">{x.skipped}</td><td className="text-xs text-ink-500">{x.errors.length ? `${x.errors.length}: ${x.errors[0]}` : ""}</td></tr>)}</tbody></table>
        </Card>
      )}
    </div>
  );
}
