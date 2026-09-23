import type { Metadata } from "next";
import { PriceCard } from "@/components/PriceCard";
import { PRICING, money } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing", description: "One transparent price for Indonesia arrival card assistance. No hidden fees. The government form itself is free." };

export default function Pricing() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="mt-2 text-ink-700">You see the total before entering any personal data. The Indonesian government does not charge for the arrival card; our fee is only for the assistance service.</p>
      <div className="mt-8"><PriceCard /></div>
      <div className="prose-basic mt-10">
        <h2>Examples</h2>
        <table>
          <thead><tr><th>Booking</th><th>Standard (under {PRICING.standardSlaHours} h)</th><th>Express (under {PRICING.expressSlaHours} h)</th></tr></thead>
          <tbody>
            {[1, 2, 4].map((n) => {
              const base = PRICING.firstTraveler + (n - 1) * PRICING.additionalTraveler;
              return <tr key={n}><td>{n} traveler{n > 1 ? "s" : ""}</td><td>{money(base)}</td><td>{money(base + PRICING.express)}</td></tr>;
            })}
          </tbody>
        </table>
        <h2>What is included</h2>
        <ul>
          <li>Guided multilingual form with passport photo reading.</li>
          <li>Manual review of every field by a trained team member.</li>
          <li>Submission on the official portal and delivery of your QR code by email and WhatsApp.</li>
          <li>Airport checklist, customs allowance summary and IMEI registration instructions.</li>
          <li>Support until you have cleared immigration.</li>
        </ul>
        <h2>Refunds</h2>
        <p>Full refund if your card is not delivered at least 6 hours before your scheduled arrival, or if you cancel before we start processing. See the <a href="/legal/refunds">refund policy</a>.</p>
      </div>
    </div>
  );
}
