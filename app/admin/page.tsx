import Link from "next/link";
import { listOrders } from "@/lib/store";
import { money, PRODUCT_LABELS } from "@/lib/pricing";
import type { OrderStatus } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ops console", robots: { index: false, follow: false } };

const statusColor: Record<OrderStatus, string> = {
  pending_payment: "bg-slate-100 text-slate-700", paid: "bg-amber-100 text-amber-900", in_progress: "bg-blue-100 text-blue-900",
  delivered: "bg-green-100 text-green-900", refunded: "bg-red-100 text-red-900", cancelled: "bg-slate-200 text-slate-600",
};

function hoursLeft(arrivalDate: string) {
  return Math.round((new Date(arrivalDate + "T00:00:00+07:00").getTime() - Date.now()) / 3.6e6);
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const orders = await listOrders({ status: status as OrderStatus | undefined });
  const queue = orders.filter((o) => o.status === "paid" || o.status === "in_progress").sort((a, b) => a.travel.arrivalDate.localeCompare(b.travel.arrivalDate));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">Ops console</h1>
      <p className="text-sm text-ink-500">Queue sorted by arrival date. Submit only inside the 72-hour window before arrival.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {["", "paid", "in_progress", "delivered", "pending_payment", "refunded"].map((s) => (
          <Link key={s} href={s ? `/admin?status=${s}` : "/admin"} className={`rounded-full px-3 py-1 ring-1 ring-slate-200 ${status === s || (!status && !s) ? "bg-brand-500 text-white" : "bg-white"}`}>{s || "all"}</Link>
        ))}
      </div>
      <table className="mt-6 w-full text-sm">
        <thead><tr className="text-left text-ink-500"><th className="py-2">Arrival</th><th>Hours to arrival</th><th>Product</th><th>Lead traveler</th><th>Pax</th><th>Express</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {(status ? orders : queue.concat(orders.filter((o) => !queue.includes(o)))).map((o) => {
            const h = hoursLeft(o.travel.arrivalDate);
            return (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="py-2">{o.travel.arrivalDate}</td>
                <td className={h <= 72 && h > 0 ? "font-semibold text-green-700" : h <= 0 ? "text-red-600" : "text-ink-500"}>{h}</td>
                <td className="text-xs">{PRODUCT_LABELS[o.product]}</td>
                <td>{o.travelers[0].familyName}, {o.travelers[0].givenNames}</td>
                <td>{o.travelers.length}</td>
                <td>{o.contact.express ? "yes" : ""}</td>
                <td>{money(o.amountCents, o.currency)}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[o.status]}`}>{o.status}</span></td>
                <td><Link className="text-brand-600 underline" href={`/admin/orders/${o.id}`}>open</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {orders.length === 0 && <p className="mt-6 text-ink-500">No orders yet.</p>}
    </div>
  );
}
