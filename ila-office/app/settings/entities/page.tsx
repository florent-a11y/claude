import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPE_LABELS, TAX_REGIME_LABELS } from "@/lib/types";
import { Page, Badge, EmptyState, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entities" };

export default async function Entities() {
  await requireUser();
  const entities = await db.list("entities", { orderBy: "name" });
  return (
    <Page title="Entities" subtitle="One entity per set of books: ILA itself and every client company whose accounting ILA keeps." actions={<Link href="/settings/entities/new" className="btn-primary">New entity</Link>}>
      {entities.length === 0 ? <EmptyState title="No entity yet" hint="Create ILA's own entity first, then one per client." action={<Link href="/settings/entities/new" className="btn-primary">New entity</Link>} /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Name</th><th>Type</th><th>Region</th><th>NPWP</th><th>Regime</th><th>PKP</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.id}>
                  <td className="pl-4 font-medium">{e.isOwn && <span className="mr-1 text-accent-600">★</span>}<Link href={`/settings/entities/${e.id}`} className="hover:underline">{e.name}</Link><br /><span className="text-xs text-ink-500">{e.legalName}</span></td>
                  <td className="text-xs">{ENTITY_TYPE_LABELS[e.type]}</td>
                  <td className="text-xs">{e.region ?? e.country}</td>
                  <td className="text-xs">{e.npwp ?? "—"}</td>
                  <td className="text-xs">{TAX_REGIME_LABELS[e.tax.regime].split(" (")[0]}</td>
                  <td className="text-xs">{e.tax.pkp ? "Yes" : "No"}</td>
                  <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                  <td className="whitespace-nowrap text-xs"><Link className="text-brand-600 underline" href={`/books/${e.id}`}>Books</Link> · <Link className="text-brand-600 underline" href={`/tax/${e.id}`}>Tax</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
