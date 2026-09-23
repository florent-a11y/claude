import type { Metadata } from "next";
import Link from "next/link";
import { getOrder } from "@/lib/store";
import { PRICING, PRODUCT_LABELS } from "@/lib/pricing";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string; dev?: string }> }) {
  const { order: id, dev } = await searchParams;
  const order = id ? await getOrder(id).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-3xl text-brand-700">✓</div>
      <h1 className="mt-6 text-3xl font-bold">Thank you – we have your details</h1>
      {order ? (
        <p className="mt-3 text-ink-700">Order <strong>{order.id.slice(0, 8).toUpperCase()}</strong> ({PRODUCT_LABELS[order.product]}). A confirmation goes to <strong>{order.contact.email}</strong>.
          {order.product !== "evoa" && <> Your arrival card QR code will follow within {order.contact.express ? PRICING.arrivalCard.expressSlaHours : PRICING.arrivalCard.standardSlaHours} hours, and no earlier than 72 hours before your arrival on {order.travel.arrivalDate}, because the official system only accepts submissions in that window.</>}
          {order.product !== "arrival_card" && <> We verify and submit your e-VOA within {order.contact.express ? PRICING.evoa.expressSlaHours : PRICING.evoa.standardSlaHours} hours; approval usually follows the same day, at most 2 working days.</>}
        </p>
      ) : (
        <p className="mt-3 text-ink-700">Your payment is being confirmed. You will receive an email shortly.</p>
      )}
      {dev && <p className="mt-3 text-xs text-amber-700">Development mode: payment provider not configured, order saved as paid.</p>}
      <div className="card mt-8 text-left text-sm">
        <h2 className="font-semibold">What happens next</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-700">
          <li>A team member checks every field against your passport details{order?.product !== "arrival_card" ? ", and your passport scan and photo for the e-VOA" : ""}.</li>
          <li>We submit the card on the official portal, entering your email so the QR arrives from the government system as well.</li>
          <li>You receive the QR code (PDF and image) plus an airport checklist by email{order?.contact.whatsapp ? " and WhatsApp" : ""}.</li>
          <li>Show the QR with your passport at immigration and customs.</li>
        </ol>
      </div>
      <Link href="/guide" className="btn-secondary mt-8">Read the airport checklist</Link>
    </div>
  );
}
