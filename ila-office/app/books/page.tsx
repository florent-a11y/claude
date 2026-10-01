import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS } from "@/lib/types";
import { Page, Badge, EmptyState, statusTone } from "@/components/ui";

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
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Entity</th><th>Type</th><th>Regime</th><th>PKP</th><th>Status</th><th className="num">Open invoices</th><th className="num">Unmatched bank lines</th><th></th></tr></thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td className="pl-4 font-medium">{e.isOwn && <span className="mr-1 text-accent-600">★</span>}<Link href={`/books/${e.id}`} className="hover:underline">{e.name}</Link><br /><span className="text-xs text-ink-500">{e.legalName}</span></td>
                  <td className="text-xs">{ENTITY_TYPE_LABELS[e.type]}</td>
                  <td className="text-xs">{e.tax.regime}</td>
                  <td className="text-xs">{e.tax.pkp ? "Yes" : "No"}</td>
                  <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                  <td className="num">{openByEntity.get(e.id) ?? 0}</td>
                  <td className="num">{unmatchedByEntity.get(e.id) ?? 0}</td>
                  <td className="whitespace-nowrap text-xs">
                    <Link className="text-brand-600 underline" href={`/books/${e.id}`}>Overview</Link> · <Link className="text-brand-600 underline" href={`/books/${e.id}/bank`}>Bank</Link> · <Link className="text-brand-600 underline" href={`/books/${e.id}/reports`}>Reports</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
