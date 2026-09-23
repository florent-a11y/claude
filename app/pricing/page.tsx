import type { Metadata } from "next";
import { PriceCard } from "@/components/PriceCard";
import { PRICING, money, quote } from "@/lib/pricing";
import Link from "next/link";

export const metadata: Metadata = { title: "Pricing", description: "One transparent price for Indonesia arrival card assistance. No hidden fees." };

export default function Pricing() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <h2 className="mt-8 text-xl font-bold">Arrival card assistance</h2>
      <p className="mt-2 text-ink-700">You see the total before entering any personal data. We are a private assistance service, not affiliated with any government website.</p>
      <div className="mt-8"><PriceCard /></div>
      <div className="prose-basic mt-10">
        <h2>Examples</h2>
        <table>
          <thead><tr><th>Booking</th><th>Standard (under {PRICING.arrivalCard.standardSlaHours} h)</th><th>Express (under {PRICING.arrivalCard.expressSlaHours} h)</th></tr></thead>
          <tbody>
            {[1, 2, 4].map((n) => {
              const base = PRICING.arrivalCard.first + (n - 1) * PRICING.arrivalCard.additional;
              return <tr key={n}><td>{n} traveler{n > 1 ? "s" : ""}</td><td>{money(base)}</td><td>{money(base + PRICING.express)}</td></tr>;
            })}
          </tbody>
        </table>
        <h2>e-VOA (visa on arrival) assistance</h2>
        <table>
          <thead><tr><th>Per traveler</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td>Government e-VOA fee (IDR 500,000 per traveler, in USD)</td><td>{money(PRICING.evoa.governmentFee)}</td></tr>
            <tr><td>Service fee, first traveler</td><td>{money(PRICING.evoa.first)}</td></tr>
            <tr><td>Service fee, each additional traveler</td><td>{money(PRICING.evoa.additional)}</td></tr>
            <tr><td>Bundle discount when ordered with arrival card assistance</td><td>−{money(PRICING.bundleDiscount)}</td></tr>
            <tr><td>Express (optional, verified within {PRICING.evoa.expressSlaHours} h)</td><td>+{money(PRICING.express)}</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>Booking</th><th>e-VOA only</th><th>e-VOA + arrival card bundle</th></tr></thead>
          <tbody>
            {[1, 2, 4].map((n) => <tr key={n}><td>{n} traveler{n > 1 ? "s" : ""}</td><td>{money(quote(n, false, "evoa").total)}</td><td>{money(quote(n, false, "bundle").total)}</td></tr>)}
          </tbody>
        </table>
        <p>The visa fee is paid on your behalf when the application is lodged with the Indonesian authorities and is non-refundable from that point. Details on the <Link href="/evoa">e-VOA page</Link>.</p>
        <h2>What is included</h2>
        <ul>
          <li>Guided multilingual form with passport photo reading.</li>
          <li>Manual review of every field by a trained team member.</li>
          <li>Submission on the official portal and delivery of your QR code by email.</li>
          <li>Airport checklist, customs allowance summary and IMEI registration instructions.</li>
          <li>Support until you have cleared immigration.</li>
        </ul>
        <h2>Refunds</h2>
        <p>Full refund if your card is not delivered at least 6 hours before your scheduled arrival, or if you cancel before we start processing. See the <a href="/legal/refunds">refund policy</a>.</p>
      </div>
    </div>
  );
}
