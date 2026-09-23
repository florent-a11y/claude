import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "Indonesia arrival card guide: requirements, 72-hour rule, QR code",
  description: "What the All Indonesia arrival card is, who needs it, the 72-hour rule, what to declare, and how the QR code works.",
};

const steps = [
  { t: "Check the timing", d: "You can only submit within 72 hours before your scheduled arrival. Earlier submissions are rejected. Set a reminder for 3 days before your flight." },
  { t: "Prepare your details", d: "Passport (number, issue and expiry dates), flight number and date, the name and address of your first accommodation, and your email address (the QR code is emailed to it)." },
  { t: "Personal and passport data", d: "Enter names exactly as printed in the passport machine-readable zone, including all given names. Nationality is your passport country, not your country of residence." },
  { t: "Travel details", d: "Arrival date, mode of transport, flight or vessel number, port of entry, purpose of visit, visa type, and your address in Indonesia (a hotel name and city is accepted)." },
  { t: "Health declaration", d: "Countries visited in the last 21 days and any current symptoms. Answer truthfully; a 'yes' does not automatically block entry, it triggers a health check." },
  { t: "Customs declaration", d: "Declare cash of IDR 100 million or more (or equivalent), goods above the personal allowance, commercial goods, animals, plants and food products, and phones you want to register for IMEI." },
  { t: "Submit and save the QR code", d: "Review, submit, and check your inbox (and spam folder). Save the QR image on your phone and, ideally, print it. Show it with your passport at immigration and customs." },
];

export default function Guide() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "HowTo", name: "What the Indonesia arrival card (All Indonesia) asks for",
                step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.t, text: s.d })),
      }} />
      <h1 className="text-3xl font-bold">The Indonesia arrival card explained</h1>
      <p className="mt-3 text-ink-700">The All Indonesia arrival card combines the immigration, customs and health declarations into one online form. It is mandatory for every traveler entering Indonesia by air, sea or land.</p>
      <ol className="mt-8 space-y-6">
        {steps.map((s, i) => (
          <li key={s.t} className="card flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 font-bold text-white">{i + 1}</span>
            <div><h2 className="font-semibold">{s.t}</h2><p className="mt-1 text-ink-700">{s.d}</p></div>
          </li>
        ))}
      </ol>
      <div className="card mt-10 bg-slate-50">
        <h2 className="text-xl font-bold">Let us prepare and check it</h2>
        <p className="mt-2 text-ink-700">Our team prepares and verifies your card for $24.90 per traveler, delivered to email and WhatsApp. Useful for families, groups, or if you are not confident with online forms.</p>
        <Link href="/apply" className="btn-primary mt-4">Use the assistance service</Link>
      </div>
    </div>
  );
}
