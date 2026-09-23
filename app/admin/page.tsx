import Link from "next/link";
import { listOrders, listReminders } from "@/lib/store";
import { money, PRODUCT_LABELS } from "@/lib/pricing";
import { OPEN_STATUSES, ORDER_STATUSES, STATUS_LABELS, type Order, type OrderStatus } from "@/lib/schema";
import { emailConfigured } from "@/lib/email";
import { sheetsConfigured } from "@/lib/sheets";
import { QuickAck } from "./QuickAck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ops console", robots: { index: false, follow: false } };

const statusColor: Record<OrderStatus, string> = {
  pending_payment: "bg-slate-100 text-slate-700", paid: "bg-red-100 text-red-900", acknowledged: "bg-amber-100 text-amber-900",
  in_progress: "bg-blue-100 text-blue-900", submitted: "bg-indigo-100 text-indigo-900", delivered: "bg-green-100 text-green-900",
  refunded: "bg-slate-200 text-slate-700", cancelled: "bg-slate-200 text-slate-600",
};

function hoursLeft(arrivalDate: string) {
  return Math.round((new Date(arrivalDate + "T00:00:00+07:00").getTime() - Date.now()) / 3.6e6);
}

const VIEWS: Array<{ key: string; label: string; filter: (o: Order) => boolean }> = [
  { key: "todo", label: "To treat", filter: (o) => OPEN_STATUSES.includes(o.status) },
  { key: "new", label: "New, not acknowledged", filter: (o) => o.status === "paid" },
  { key: "window", label: "Window open (≤72 h)", filter: (o) => OPEN_STATUSES.includes(o.status) && hoursLeft(o.travel.arrivalDate) <= 72 },
  { key: "done", label: "Done", filter: (o) => o.status === "delivered" },
  { key: "all", label: "All", filter: () => true },
];

export default async function Admin({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string; assignee?: string }> }) {
  const sp = await searchParams;
  const [all, reminders] = await Promise.all([listOrders({ limit: 2000 }), listReminders({ limit: 5000 }).catch(() => [])]);
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const q = (sp.q ?? "").trim().toLowerCase();
  let rows = all.filter(view.filter);
  if (sp.status) rows = rows.filter((o) => o.status === sp.status);
  if (sp.assignee) rows = rows.filter((o) => (o.assignee ?? "") === sp.assignee);
  if (q) rows = rows.filter((o) => [o.id, o.contact.email, o.contact.phone, ...o.travelers.flatMap((t) => [t.familyName, t.givenNames, t.passportNumber])].some((v) => v?.toLowerCase().includes(q)));
  const openFirst = (a: Order, b: Order) => {
    const ao = OPEN_STATUSES.includes(a.status) ? 0 : 1, bo = OPEN_STATUSES.includes(b.status) ? 0 : 1;
    return ao - bo || a.travel.arrivalDate.localeCompare(b.travel.arrivalDate);
  };
  rows.sort(openFirst);

  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    new: all.filter((o) => o.status === "paid").length,
    open: all.filter((o) => OPEN_STATUSES.includes(o.status)).length,
    window: all.filter((o) => OPEN_STATUSES.includes(o.status) && hoursLeft(o.travel.arrivalDate) <= 72).length,
    overdue: all.filter((o) => OPEN_STATUSES.includes(o.status) && hoursLeft(o.travel.arrivalDate) <= 6).length,
    deliveredToday: all.filter((o) => o.deliveredAt?.slice(0, 10) === today).length,
    revenue30d: all.filter((o) => o.paidAt && Date.now() - new Date(o.paidAt).getTime() < 30 * 864e5 && o.status !== "refunded").reduce((s, o) => s + o.amountCents, 0),
    reminders: reminders.filter((r) => !r.unsubscribedAt && hoursLeft(r.arrivalDate) > 0).length,
  };
  const assignees = [...new Set(all.map((o) => o.assignee).filter(Boolean))] as string[];
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(); for (const [k, v] of Object.entries({ view: sp.view, status: sp.status, q: sp.q, assignee: sp.assignee, ...patch })) if (v) p.set(k, v);
    return `/admin?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Ops console</h1><p className="text-sm text-ink-500">Submit arrival cards only inside the 72-hour window. Acknowledge new orders so the team knows who has them.</p></div>
        <div className="flex gap-2 text-sm"><Link className="btn-secondary !py-2" href="/admin/reminders">Reminder list</Link><a className="btn-secondary !py-2" href="/api/admin/export">Export CSV</a></div>
      </div>
      {(!emailConfigured() || !sheetsConfigured()) && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {!emailConfigured() && "Email alerts are off (set RESEND_API_KEY, EMAIL_FROM, OPS_EMAIL). "}{!sheetsConfigured() && "Google Sheet sync is off (set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON)."}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[["New (paid)", stats.new, "text-red-700"], ["Open", stats.open, ""], ["Window open", stats.window, "text-green-700"], ["Due ≤ 6 h", stats.overdue, "text-red-700"], ["Delivered today", stats.deliveredToday, ""], ["Revenue 30 d", money(stats.revenue30d), ""]].map(([l, v, c]) => (
          <div key={String(l)} className="card !p-4"><p className="text-xs text-ink-500">{l}</p><p className={`text-2xl font-bold ${c}`}>{v}</p></div>
        ))}
        <Link href="/admin/reminders" className="card !p-4 hover:bg-brand-50"><p className="text-xs text-ink-500">Reminders (upcoming)</p><p className="text-2xl font-bold">{stats.reminders}</p></Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        {VIEWS.map((v) => <Link key={v.key} href={link({ view: v.key, status: undefined })} className={`rounded-full px-3 py-1 ring-1 ring-slate-200 ${view.key === v.key ? "bg-brand-500 text-white" : "bg-white"}`}>{v.label} ({all.filter(v.filter).length})</Link>)}
        <form className="ml-auto flex gap-2" action="/admin"><input type="hidden" name="view" value={view.key} /><input name="q" defaultValue={sp.q} placeholder="Search name, passport, email" className="input !py-1.5 text-sm" /><button className="btn-secondary !py-1.5 text-sm">Search</button></form>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="text-ink-500">Status:</span>
        {ORDER_STATUSES.map((s) => <Link key={s} href={link({ status: sp.status === s ? undefined : s })} className={`rounded-full px-2 py-0.5 ${sp.status === s ? "ring-2 ring-brand-500 " : ""}${statusColor[s]}`}>{STATUS_LABELS[s]}</Link>)}
        {assignees.length > 0 && <><span className="ml-3 text-ink-500">Assignee:</span>{assignees.map((a) => <Link key={a} href={link({ assignee: sp.assignee === a ? undefined : a })} className={`rounded-full bg-slate-100 px-2 py-0.5 ${sp.assignee === a ? "ring-2 ring-brand-500" : ""}`}>{a}</Link>)}</>}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500"><th className="py-2">Arrival</th><th>h left</th><th>Status</th><th>Assignee</th><th>Product</th><th>Lead traveler</th><th>Pax</th><th>Contact</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {rows.map((o) => {
              const h = hoursLeft(o.travel.arrivalDate);
              return (
                <tr key={o.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 whitespace-nowrap">{o.travel.arrivalDate}</td>
                  <td className={h <= 72 && h > 6 ? "font-semibold text-green-700" : h <= 6 ? "font-semibold text-red-600" : "text-ink-500"}>{h}</td>
                  <td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${statusColor[o.status]}`}>{STATUS_LABELS[o.status]}</span></td>
                  <td className="text-xs">{o.assignee ?? <span className="text-ink-500">—</span>}</td>
                  <td className="text-xs">{PRODUCT_LABELS[o.product]}{o.contact.express && <span className="ml-1 rounded bg-accent-500 px-1 text-[10px] font-bold text-white">EXPRESS</span>}</td>
                  <td className="whitespace-nowrap">{o.travelers[0].familyName}, {o.travelers[0].givenNames} <span className="text-xs text-ink-500">({o.travelers[0].nationality})</span></td>
                  <td>{o.travelers.length}</td>
                  <td className="text-xs">{o.contact.email}<br />{o.contact.phone}</td>
                  <td className="whitespace-nowrap">{money(o.amountCents, o.currency)}</td>
                  <td className="whitespace-nowrap"><Link className="text-brand-600 underline" href={`/admin/orders/${o.id}`}>open</Link>{o.status === "paid" && <QuickAck id={o.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="mt-6 text-ink-500">Nothing here.</p>}
      </div>
    </div>
  );
}
