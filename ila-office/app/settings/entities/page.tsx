import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_SHORT, TAX_REGIME_LABELS, TAX_REGIME_SHORT } from "@/lib/types";
import { Page, Badge, Cols, Dash, EmptyState, TableCard, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entities" };

export default async function Entities() {
  await requireTeam();
  const entities = await db.list("entities", { orderBy: "name" });
  return (
    <Page title="Entities" subtitle="One entity per set of books: ILA itself and every client company whose accounting ILA keeps." actions={<Link href="/settings/entities/new" className="btn-primary">New entity</Link>}>
      {entities.length === 0 ? <EmptyState title="No entity yet" hint="Create ILA's own entity first, then one per client." action={<Link href="/settings/entities/new" className="btn-primary">New entity</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[980px]">
            <Cols widths={[undefined, 120, 90, 180, 150, 60, 90, 110]} />
            <thead><tr><th>Name</th><th>Type</th><th>Region</th><th>NPWP</th><th>Regime</th><th>PKP</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.id} className={e.status === "closed" ? "row-muted" : ""}>
                  <td>
                    <Link href={`/settings/entities/${e.id}`} className="cell-primary" title={e.name}>{e.isOwn && <span className="mr-1 text-accent-600">★</span>}{e.name}</Link>
                    <span className="cell-sub" title={e.legalName}>{e.legalName}</span>
                  </td>
                  <td><span className="cell" title={ENTITY_TYPE_LABELS[e.type]}>{ENTITY_TYPE_SHORT[e.type]}</span></td>
                  <td><span className="cell" title={e.region ?? e.country}>{e.region ?? e.country}</span></td>
                  <td className="whitespace-nowrap">{e.npwp ?? <Dash />}</td>
                  <td><span className="cell" title={TAX_REGIME_LABELS[e.tax.regime]}>{TAX_REGIME_SHORT[e.tax.regime]}</span></td>
                  <td>{e.tax.pkp ? "Yes" : "No"}</td>
                  <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                  <td className="whitespace-nowrap text-right text-xs"><Link className="text-brand-600 hover:underline" href={`/books/${e.id}`}>Books</Link><span className="mx-1 text-slate-300">·</span><Link className="text-brand-600 hover:underline" href={`/tax/${e.id}`}>Tax</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </Page>
  );
}
