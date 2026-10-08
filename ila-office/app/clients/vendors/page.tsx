import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { VENDOR_CATEGORIES } from "@/lib/types";
import { matchesSearch } from "../_lib/search";
import { Page, Badge, Chips, Cols, Dash, EmptyState, TableCard, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { VENDOR_CATEGORY_LABELS } from "./VendorForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors" };

export default async function Vendors({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; inactive?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const all = await db.list("vendors", { orderBy: "name" });
  const write = can(me, "crm:write");
  const q = sp.q?.trim() ?? "";
  const rows = all.filter((v) => (sp.inactive ? true : v.active) && (!sp.category || v.category === sp.category) && matchesSearch([v.name, v.email, v.phone, v.npwp, v.region, v.notes, VENDOR_CATEGORY_LABELS[v.category]], q));
  const base = "/clients/vendors";
  const categories = VENDOR_CATEGORIES.filter((c) => all.some((v) => v.category === c));
  return (
    <Page title="Vendors" subtitle="Notaries, Kanim and BKPM agents, government offices and suppliers: the counterparties of purchase bills." actions={write && <Link href="/clients/vendors/new" className="btn-primary">New vendor</Link>}>
      <div className="mb-3 space-y-2 no-print">
        <form className="flex flex-wrap items-center gap-2">
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          {sp.inactive && <input type="hidden" name="inactive" value={sp.inactive} />}
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search vendor, phone, email, NPWP…" className="input max-w-sm" />
          <Link href={withParams(base, sp, { inactive: sp.inactive ? undefined : "1" })} className="btn-ghost !px-2 !py-1 text-xs">{sp.inactive ? "Hide inactive" : "Show inactive"}</Link>
          {(q || sp.category) && <Link href={base} className="btn-ghost !px-2 !py-1 text-xs">Clear</Link>}
          <span className="ml-auto text-xs text-ink-500">{rows.length} shown</span>
        </form>
        <Chips items={[{ href: withParams(base, sp, { category: undefined }), label: "All", active: !sp.category }, ...categories.map((c) => ({ href: withParams(base, sp, { category: c }), label: VENDOR_CATEGORY_LABELS[c].split(" (")[0].split(" /")[0], active: sp.category === c }))]} />
      </div>
      {rows.length === 0 ? <EmptyState title="No vendors" action={write && <Link href="/clients/vendors/new" className="btn-primary">New vendor</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[940px]">
            <Cols widths={[undefined, 190, 90, 150, 200, 96]} />
            <thead><tr><th>Vendor</th><th>Category</th><th>Region</th><th>Phone / WhatsApp</th><th>Email</th><th>Status</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.id} className={v.active ? "" : "text-ink-500"}>
                <td>
                  {write ? <Link href={`/clients/vendors/${v.id}`} className="cell-primary" title={v.name}>{v.name}</Link> : <span className="cell-primary" title={v.name}>{v.name}</span>}
                  {(v.npwp || v.notes) && <span className="cell-sub" title={[v.npwp ? `NPWP ${v.npwp}` : "", v.notes ?? ""].filter(Boolean).join("\n")}>{[v.npwp ? `NPWP ${v.npwp}` : "", v.notes ?? ""].filter(Boolean).join(" · ")}</span>}
                </td>
                <td><span className="cell text-xs" title={VENDOR_CATEGORY_LABELS[v.category]}>{VENDOR_CATEGORY_LABELS[v.category]}</span></td>
                <td className="text-xs">{v.region ?? <Dash />}</td>
                <td className="whitespace-nowrap text-xs">{v.phone ?? <Dash />}</td>
                <td>{v.email ? <a href={`mailto:${v.email}`} className="cell text-xs hover:text-brand-700 hover:underline" title={v.email}>{v.email}</a> : <Dash />}</td>
                <td><Badge tone={v.active ? "green" : "slate"}>{v.active ? "active" : "inactive"}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
      )}
    </Page>
  );
}
