import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { VENDOR_CATEGORIES } from "@/lib/types";
import { Page, Badge, Chips, EmptyState, withParams } from "@/components/ui";
import { VENDOR_CATEGORY_LABELS } from "./VendorForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors" };

export default async function Vendors({ searchParams }: { searchParams: Promise<{ category?: string; inactive?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const all = await db.list("vendors", { orderBy: "name" });
  const write = can(me, "crm:write");
  const rows = all.filter((v) => (sp.inactive ? true : v.active) && (!sp.category || v.category === sp.category));
  const base = "/clients/vendors";
  return (
    <Page title="Vendors" subtitle="Notaries, Kanim and BKPM agents, government offices and suppliers: the counterparties of purchase bills." actions={write && <Link href="/clients/vendors/new" className="btn-primary">New vendor</Link>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <Chips items={[{ href: withParams(base, sp, { category: undefined }), label: "All", active: !sp.category }, ...VENDOR_CATEGORIES.filter((c) => all.some((v) => v.category === c)).map((c) => ({ href: withParams(base, sp, { category: c }), label: VENDOR_CATEGORY_LABELS[c].split(" (")[0].split(" /")[0], active: sp.category === c }))]} />
        <Link href={withParams(base, sp, { inactive: sp.inactive ? undefined : "1" })} className="text-xs text-brand-600 underline">{sp.inactive ? "Hide inactive" : "Show inactive"}</Link>
      </div>
      {rows.length === 0 ? <EmptyState title="No vendors" action={write && <Link href="/clients/vendors/new" className="btn-primary">New vendor</Link>} /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Vendor</th><th>Category</th><th>Region</th><th>Phone</th><th>Email</th><th>NPWP</th><th>Status</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.id}>
                <td className="pl-4 font-medium">{write ? <Link href={`/clients/vendors/${v.id}`} className="hover:underline">{v.name}</Link> : v.name}{v.notes && <span className="block max-w-xs truncate text-xs font-normal text-ink-500" title={v.notes}>{v.notes}</span>}</td>
                <td className="text-xs">{VENDOR_CATEGORY_LABELS[v.category]}</td>
                <td className="text-xs">{v.region ?? "—"}</td>
                <td className="whitespace-nowrap text-xs">{v.phone ?? "—"}</td>
                <td className="text-xs">{v.email ?? "—"}</td>
                <td className="text-xs">{v.npwp ?? "—"}</td>
                
                <td><Badge tone={v.active ? "green" : "red"}>{v.active ? "active" : "inactive"}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
