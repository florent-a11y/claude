import { listOrders } from "@/lib/store";
import { idr } from "@/lib/money";
import type { Order, OrderStatus } from "@/lib/schema";
import { METHOD_LABEL, STATUS_LABEL, STATUS_TONE, baliTime } from "@/lib/admin-ui";

export const dynamic = "force-dynamic";

const VIEWS: Array<{ key: string; label: string; statuses: OrderStatus[] }> = [
  { key: "review", label: "Doctor review", statuses: ["awaiting_review"] },
  { key: "transfer", label: "Transfers to check", statuses: ["payment_review"] },
  { key: "fulfil", label: "To prepare and deliver", statuses: ["confirmed", "out_for_delivery"] },
  { key: "pay", label: "Awaiting payment", statuses: ["awaiting_payment"] },
  { key: "done", label: "Closed", statuses: ["completed", "declined", "cancelled", "refunded"] },
  { key: "all", label: "All", statuses: [] },
];

function when(o: Order) {
  if (!o.fulfilment.date) return "to agree";
  return `${o.fulfilment.date.slice(5)} ${o.fulfilment.slot ?? ""}`.trim();
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: requested } = await searchParams;
  const orders = await listOrders({ limit: 500 });
  const view = VIEWS.find((v) => v.key === requested) ?? VIEWS[0];
  const inView = (v: (typeof VIEWS)[number]) => (v.statuses.length ? orders.filter((o) => v.statuses.includes(o.status)) : orders);
  const rows = inView(view);
  return (
    <>
      <h1 className="font-display text-4xl font-semibold text-forest-900">Orders</h1>
      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Order views">
        {VIEWS.map((v) => (
          <a key={v.key} href={`/admin?view=${v.key}`} aria-current={v.key === view.key ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${v.key === view.key ? "border-forest-800 bg-forest-800 text-sand-50" : "border-sand-300 bg-white text-forest-900 hover:border-forest-800/50"}`}>
            {v.label} <span className="ml-1 opacity-70">{inView(v).length}</span>
          </a>
        ))}
      </nav>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-sand-200 bg-white">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-sand-100 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th scope="col" className="px-4 py-3">Order</th>
              <th scope="col" className="px-4 py-3">Placed</th>
              <th scope="col" className="px-4 py-3">Customer</th>
              <th scope="col" className="px-4 py-3">Items</th>
              <th scope="col" className="px-4 py-3">Where / when</th>
              <th scope="col" className="px-4 py-3 text-right">Total</th>
              <th scope="col" className="px-4 py-3">Payment</th>
              <th scope="col" className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-500">Nothing here.</td></tr>}
            {rows.map((o) => (
              <tr key={o.id} className="align-top hover:bg-sand-50">
                <td className="px-4 py-3"><a className="font-semibold text-forest-700 underline underline-offset-2" href={`/admin/orders/${o.id}`}>{o.id}</a></td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-700">{baliTime(o.createdAt)}</td>
                <td className="px-4 py-3"><span className="font-medium">{o.contact.name}</span><br /><span className="text-ink-500">{o.contact.phone}</span></td>
                <td className="px-4 py-3 text-ink-700">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-ink-700">{o.fulfilment.mode === "address" ? o.fulfilment.area : "Lounge"}<br /><span className="text-ink-500">{when(o)}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{idr(o.totalIdr)}</td>
                <td className="px-4 py-3 text-ink-700">{o.paid ? "Paid" : "Unpaid"}{o.paymentMethod ? <><br /><span className="text-ink-500">{METHOD_LABEL[o.paymentMethod]}</span></> : null}</td>
                <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
