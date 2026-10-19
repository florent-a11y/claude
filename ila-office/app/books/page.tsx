import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_SHORT, TAX_REGIME_SHORT } from "@/lib/types";
import { Page, Badge, Cols, Dash, EmptyState, TableCard, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Books" };

/** Entity picker: one set of books per entity (ILA itself and every client company). */
export default async function BooksIndex() {
  await requireUser();
  const [entities, invoices, bankTx] = await Promise.all([
    db.list("entities", { orderBy: "name" }),
    db.list("invoices", { where: (i) => i.status === "sent" || i.status === "partial" }),
    db.list("bank_transactions", { where: { status: "unmatched" } }),
  ]);
  const openByEntity = new Map<string, number>();
  for (const i of invoices) openByEntity.set(i.entityId, (openByEntity.get(i.entityId) ?? 0) + 1);
  const unmatchedByEntity = new Map<string, number>();
  for (const t of bankTx) unmatchedByEntity.set(t.entityId, (unmatchedByEntity.get(t.entityId) ?? 0) + 1);
  const sorted = [...entities].sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || a.name.localeCompare(b.name));
  return (
    <Page title="Books" subtitle="Pick the entity whose books you want to work on.">
      {sorted.length === 0 ? <EmptyState title="No entity yet" hint="Create ILA's own entity first, then one per client." action={<Link href="/settings/entities/new" className="btn-primary">New entity</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[950px]">
            <Cols widths={[undefined, 110, 120, 86, 116, 164, 186]} />
            <thead><tr><th>Entity</th><th>Type</th><th>Regime</th><th>Status</th><th className="num">Open invoices</th><th className="num">Unmatched bank lines</th><th></th></tr></thead>
            <tbody>
              {sorted.map((e) => {
                const open = openByEntity.get(e.id) ?? 0, unmatched = unmatchedByEntity.get(e.id) ?? 0;
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/books/${e.id}`} className="cell-primary" title={e.name}>{e.isOwn && <span className="mr-1 text-accent-600">★</span>}{e.name}</Link>
                      <span className="cell-sub" title={e.legalName}>{e.legalName}</span>
                    </td>
                    <td><span className="cell text-xs" title={ENTITY_TYPE_LABELS[e.type]}>{ENTITY_TYPE_SHORT[e.type]}</span></td>
                    <td><span className="cell text-xs" title={TAX_REGIME_SHORT[e.tax.regime]}>{TAX_REGIME_SHORT[e.tax.regime]}</span><span className="cell-sub">{e.tax.pkp ? `PKP ${Math.round(e.tax.ppnRate * 100)}%` : "non-PKP"}</span></td>
                    <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                    <td className="num">{open > 0 ? open : <Dash />}</td>
                    <td className="num">{unmatched > 0 ? unmatched : <Dash />}</td>
                    <td className="whitespace-nowrap text-right text-xs">
                      <Link className="text-brand-600 underline" href={`/books/${e.id}`}>Overview</Link> · <Link className="text-brand-600 underline" href={`/books/${e.id}/bank`}>Bank</Link> · <Link className="text-brand-600 underline" href={`/books/${e.id}/reports`}>Reports</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </Page>
  );
}
