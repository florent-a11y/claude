import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PRICING, money } from "@/lib/pricing";
import { EVOA } from "@/lib/evoa";
import { site } from "@/lib/config";
import { EligibilityChecker } from "./Eligibility";

export const metadata: Metadata = {
  title: "Indonesia e-VOA application assistance – visa on arrival online",
  description: "We prepare and submit your Indonesia e-VOA (electronic visa on arrival): 30 days, extendable once. Human-checked, visa fee itemized, delivered by email.",
};

const steps = [
  { t: "Check eligibility", d: "Enter your nationality below. ASEAN nationals are visa-free; most other travelers can use the e-VOA." },
  { t: "Send passport and photo", d: "Upload a photo of your passport bio page and a recent passport-style photo from your phone." },
  { t: "We prepare and check", d: "A team member checks passport validity (6 months minimum), photo quality and every field, then submits the application." },
  { t: "Receive your e-VOA", d: "Usually the same day, at most 2 working days. Print it or show it on your phone at immigration. Combine it with your arrival card QR." },
];

export default function Evoa() {
  const q = { first: PRICING.evoa.first + PRICING.evoa.governmentFee, additional: PRICING.evoa.additional + PRICING.evoa.governmentFee };
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Service", name: "Indonesia e-VOA application assistance",
        provider: { "@type": "Organization", name: site.company, address: site.address },
        offers: { "@type": "Offer", price: (q.first / 100).toFixed(2), priceCurrency: "USD", url: `${site.url}/apply?product=evoa` },
      }} />
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">Electronic Visa on Arrival · {EVOA.validityDays} days · extendable once</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Your Indonesia e-VOA, prepared and checked before you fly.</h1>
            <p className="mt-5 text-lg text-ink-700">Skip the queue at the visa-on-arrival counter. We check your passport and photo, submit the electronic visa on arrival application, and send you the approved e-VOA by email.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/apply?product=evoa" className="btn-primary">Start e-VOA – {money(q.first)}</Link>
              <Link href="/apply?product=bundle" className="btn-secondary">e-VOA + arrival card bundle</Link>
            </div>
            <p className="mt-4 text-sm text-ink-500">Private assistance service, not affiliated with any government website. <Link className="underline" href="/legal/disclosure">Read our disclosure</Link>.</p>
          </div>
          <div className="card border-brand-100">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Price per traveler, itemized</p>
            <ul className="mt-4 divide-y divide-slate-100 text-ink-700">
              <li className="flex justify-between py-3"><span>Government e-VOA fee (IDR {EVOA.governmentFeeIdr.toLocaleString("en-US")} per traveler, in USD)</span><strong>{money(PRICING.evoa.governmentFee)}</strong></li>
              <li className="flex justify-between py-3"><span>Our service fee, first traveler</span><strong>{money(PRICING.evoa.first)}</strong></li>
              <li className="flex justify-between py-3"><span>Our service fee, each additional traveler</span><strong>{money(PRICING.evoa.additional)}</strong></li>
              <li className="flex justify-between py-3"><span>Bundle with arrival card assistance</span><strong className="text-brand-600">save {money(PRICING.bundleDiscount)} per traveler</strong></li>
              <li className="flex justify-between py-3"><span>Express, verified within {PRICING.evoa.expressSlaHours} h (optional)</span><strong>+{money(PRICING.express)}</strong></li>
            </ul>
            <p className="mt-3 text-lg font-bold">Total first traveler: {money(q.first)}</p>
            <p className="mt-2 text-sm text-ink-500">Service fee refunded in full if your nationality is not eligible or if we cannot submit. The visa fee is non-refundable once the application is lodged with the authorities.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">Am I eligible?</h2>
        <p className="mt-2 text-ink-700">Passport must be valid at least {EVOA.passportMinValidityMonths} months from the date of entry. You need a return or onward ticket.</p>
        <EligibilityChecker />
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.t} className="card"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-bold text-white">{i + 1}</span><h3 className="mt-4 font-semibold">{s.t}</h3><p className="mt-1 text-sm text-ink-700">{s.d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="prose-basic mx-auto max-w-3xl px-4 py-14">
        <h2>e-VOA facts</h2>
        <ul>
          <li>Stay: {EVOA.validityDays} days from entry, extendable once for another {EVOA.extendableOnceDays} days at an immigration office in Indonesia.</li>
          <li>Purposes: tourism, family visits, business meetings and purchasing, transit, official duties. Not valid for employment or journalism.</li>
          <li>Apply up to about {EVOA.applyWindowDays} days before travel. Processing is typically {EVOA.typicalProcessing}.</li>
          <li>Documents: passport bio page (valid 6+ months), recent passport-style photo, return or onward ticket, email address.</li>
          <li>Entry through any international airport, seaport or land border that accepts visa on arrival. You still need the arrival card QR.</li>
        </ul>
      </section>
    </>
  );
}
