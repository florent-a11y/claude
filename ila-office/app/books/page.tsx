import Link from "next/link";
import { can, requireUser, scopeEntities } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_SHORT, TAX_REGIME_SHORT } from "@/lib/types";
import { Page, Badge, Cols, Dash, EmptyState, Notice, TableCard, statusTone } from "@/components/ui";
import { companyNeedsBooks } from "@/app/settings/entities/create-entity";
import { CreateBooksButton } from "@/app/clients/companies/CreateBooksButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Books" };

/**
 * Entity picker: one set of books per entity (ILA itself and every client company). A client created under Clients →
 * Client companies gets its books in the same step; admins are told here about the active clients that still have none
 * (created before that, or with the box unticked) and can create them all at once.
 */
export default async function BooksIndex() {
  const user = await requireUser();
  const admin = can(user, "admin");
  const [entities, invoices, bankTx, withoutBooks] = await Promise.all([
    db.list("entities", { orderBy: "name" }).then((rows) => scopeEntities(user, rows)),
    db.list("invoices", { where: (i) => i.status === "sent" || i.status === "partial" }),
    db.list("bank_transactions", { where: { status: "unmatched" } }),
    admin ? db.list("companies").then((rows) => rows.filter(companyNeedsBooks).length) : 0,
  ]);
  const openByEntity = new Map<string, number>();
  for (const i of invoices) openByEntity.set(i.entityId, (openByEntity.get(i.entityId) ?? 0) + 1);
  const unmatchedByEntity = new Map<string, number>();
  for (const t of bankTx) unmatchedByEntity.set(t.entityId, (unmatchedByEntity.get(t.entityId) ?? 0) + 1);
  const sorted = [...entities].sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || a.name.localeCompare(b.name));
  return (
    <Page title="Books" subtitle="Pick the entity whose books you want to work on.">
      {withoutBooks > 0 && (
        <div className="mb-4 no-print"><Notice tone="amber"><div className="flex flex-wrap items-center justify-between gap-3">
          <span>{withoutBooks} client compan{withoutBooks === 1 ? "y has" : "ies have"} no books yet, so {withoutBooks === 1 ? "it does" : "they do"} not appear here or under Tax and Payroll. <Link href="/clients/companies?books=none" className="font-medium underline">See the list</Link> to create them one by one.</span>
          <CreateBooksButton count={withoutBooks} />
        </div></Notice></div>
      )}
      {sorted.length === 0 ? <EmptyState title="No entity yet" hint="Create ILA's own entity first, then one per client." action={admin && <Link href="/settings/entities/new" className="btn-primary">New entity</Link>} /> : (
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
