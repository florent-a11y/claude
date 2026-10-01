import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "@/lib/types";
import { Page, Card, Badge, Field, Select, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createService, updateService } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service catalogue" };
const CADENCES = ["none", "monthly", "quarterly", "annual", "biennial"];
const UNITS = ["each", "per year", "per month", "per quarter", "per person", "per agreement", "per class", "per hour"];

export default async function Services({ searchParams }: { searchParams: Promise<{ inactive?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const write = can(me, "crm:write");
  const all = (await db.list("services")).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code));
  const rows = sp.inactive ? all : all.filter((s) => s.active);
  const cols = "grid grid-cols-[7rem_1fr_7rem_8rem_6rem_6rem_6.5rem_4rem_3rem_4.5rem] items-center gap-2";
  return (
    <Page title="Service catalogue" subtitle={`${all.filter((s) => s.active).length} active services · list prices in IDR, with the USD/EUR figures ILA actually quotes. Edit inline.`}
      actions={<a href={sp.inactive ? "/crm/services" : "/crm/services?inactive=1"} className="btn-secondary">{sp.inactive ? "Hide inactive" : "Show inactive"}</a>}>
      {all.length === 0 && <EmptyState title="Catalogue is empty" hint="Run the seed script or add services below." />}
      <div className="space-y-4">
        {SERVICE_CATEGORIES.map((cat) => {
          const items = rows.filter((s) => s.category === cat);
          if (items.length === 0) return null;
          return (
            <Card key={cat} title={`${SERVICE_CATEGORY_LABELS[cat]} (${items.length})`} className="overflow-x-auto">
              <div className="min-w-[72rem] text-sm">
                <div className={`${cols} border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-500`}><span>Code</span><span>Name</span><span>Unit</span><span className="text-right">IDR</span><span className="text-right">USD</span><span className="text-right">EUR</span><span>Cadence</span><span className="text-right">Renew (m)</span><span>Active</span><span></span></div>
                {items.map((s) => (
                  <form key={s.id} action={updateService.bind(null, s.id)} className={`${cols} border-t border-slate-100 py-1`}>
                    <span className="truncate font-mono text-xs" title={s.description}>{s.code}</span>
                    <span><input name="name" defaultValue={s.name} required className="input !py-1" disabled={!write} />{s.includesNote && <span className="block truncate text-[11px] text-ink-500" title={s.includesNote}>{s.includesNote}</span>}</span>
                    <input name="unit" defaultValue={s.unit} list="units" className="input !py-1" disabled={!write} />
                    <input name="priceIDR" type="number" min={0} defaultValue={s.priceIDR} className="input !w-32 !py-1 text-right" disabled={!write} />
                    <input name="priceUSD" type="number" min={0} step="0.01" defaultValue={s.priceUSD ?? ""} className="input !w-24 !py-1 text-right" disabled={!write} />
                    <input name="priceEUR" type="number" min={0} step="0.01" defaultValue={s.priceEUR ?? ""} className="input !w-24 !py-1 text-right" disabled={!write} />
                    <Select name="cadence" defaultValue={s.cadence} options={CADENCES} className="input !py-1" />
                    <input name="renewalMonths" type="number" min={0} max={120} defaultValue={s.renewalMonths ?? ""} className="input !py-1 text-right" disabled={!write} />
                    <label className="flex justify-center"><input type="checkbox" name="active" defaultChecked={s.active} className="checkbox" disabled={!write} /></label>
                    {write ? <button className="btn-secondary !px-2 !py-1 text-xs">Save</button> : <Badge tone={s.taxTreatment === "ppn" ? "blue" : "slate"}>{s.taxTreatment === "ppn" ? "PPN" : "no PPN"}</Badge>}
                  </form>
                ))}
              </div>
            </Card>
          );
        })}
        <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        {write && (
          <Card title="Add a service">
            <form action={createService} className="grid gap-3 md:grid-cols-4">
              <Field label="Code"><input name="code" required className="input font-mono uppercase" placeholder="VISA-NEW" /></Field>
              <Field label="Category"><Select name="category" defaultValue="visa" options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: SERVICE_CATEGORY_LABELS[c] }))} /></Field>
              <Field label="Name" className="md:col-span-2"><input name="name" required className="input" /></Field>
              <Field label="Unit"><input name="unit" defaultValue="each" list="units" className="input" /></Field>
              <Field label="Price IDR"><input name="priceIDR" type="number" min={0} defaultValue={0} className="input" /></Field>
              <Field label="Price USD"><input name="priceUSD" type="number" min={0} step="0.01" className="input" /></Field>
              <Field label="Price EUR"><input name="priceEUR" type="number" min={0} step="0.01" className="input" /></Field>
              <Field label="Cadence"><Select name="cadence" defaultValue="none" options={CADENCES} /></Field>
              <Field label="Renewal months"><input name="renewalMonths" type="number" min={0} max={120} className="input" /></Field>
              <Field label="Tax treatment"><Select name="taxTreatment" defaultValue="out_of_scope" options={[{ value: "out_of_scope", label: "Out of scope (no PPN)" }, { value: "ppn", label: "PPN" }]} /></Field>
              <Field label="Includes note"><input name="includesNote" className="input" placeholder="USD 1,200 DKP-TKA included" /></Field>
              <Field label="Description" className="md:col-span-3"><input name="description" className="input" /></Field>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="active" defaultChecked className="checkbox" /> Active</label>
              <div className="md:col-span-4"><SubmitButton>Add service</SubmitButton></div>
            </form>
          </Card>
        )}
      </div>
    </Page>
  );
}
