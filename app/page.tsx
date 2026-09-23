import Link from "next/link";
import { CheckCircle2, Clock, Languages, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { PriceCard } from "@/components/PriceCard";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/lib/config";

const steps = [
  { n: 1, t: "See the price", d: "The full price is on this page and on the first form screen. Nothing is added later." },
  { n: 2, t: "Fill our guided form", d: "Plain-language questions in one place: passport, flight, stay, health and customs declarations." },
  { n: 3, t: "We prepare and check", d: "A trained team member checks every field, then submits it on the official portal on your behalf." },
  { n: 4, t: "Receive your QR", d: "By email and WhatsApp, with a reminder for the 72-hour window and a one-page airport checklist." },
];

const features = [
  { icon: ShieldCheck, t: "Human-checked", d: "Every submission is reviewed by a person. Typos in a passport number are the number one cause of airport delays." },
  { icon: Clock, t: "Delivered in under 12 h", d: "Express option delivers in under 2 hours. Full refund if we miss the deadline before your arrival." },
  { icon: Languages, t: "Support in your language", d: "Chat with us in English, Chinese, Korean, Japanese, German, French or Russian." },
  { icon: Smartphone, t: "Works on your phone", d: "Photograph your passport, we read the details. No app to install, no account to create." },
  { icon: MessageCircle, t: "WhatsApp delivery", d: "Your QR code and airport checklist arrive where you will look for them." },
  { icon: CheckCircle2, t: "Customs and IMEI covered", d: "We tell you what to declare, what the allowances are and how to register your phone." },
];

export default function Home() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Indonesia arrival card assistance",
        provider: { "@type": "Organization", name: site.company, address: site.address },
        areaServed: "Indonesia",
        offers: { "@type": "Offer", price: "24.90", priceCurrency: "USD", url: `${site.url}/apply` },
        description: site.description,
      }} />
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">Mandatory for all arrivals to Indonesia since 1 Sept 2025</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Your Indonesia arrival card, prepared and checked by a person.</h1>
            <p className="mt-5 text-lg text-ink-700">
              Skip the confusing form and the typo risk. Answer our guided questions, we prepare and submit your All Indonesia arrival card and send the QR code to your email and WhatsApp.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/apply" className="btn-primary">Start now – $24.90 per traveler</Link>
              <Link href="/guide" className="btn-secondary">How it works</Link>
            </div>
            <p className="mt-4 text-sm text-ink-500">Private assistance service, not affiliated with any government website. <Link className="underline" href="/legal/disclosure">Read our disclosure</Link>.</p>
          </div>
          <PriceCard />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="card">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-bold text-white">{s.n}</span>
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-700">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">What you get for the fee</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.t} className="card">
                <f.icon className="h-7 w-7 text-brand-600" aria-hidden />
                <h3 className="mt-3 font-semibold">{f.t}</h3>
                <p className="mt-1 text-sm text-ink-700">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="card grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Want to understand the arrival card first?</h2>
            <p className="mt-2 text-ink-700">We explain what the All Indonesia arrival card is, who needs it, the 72-hour rule, and every declaration you will be asked for.</p>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <Link href="/guide" className="btn-secondary">Read the guide</Link>
            <Link href="/faq" className="btn-ghost">FAQ</Link>
          </div>
        </div>
      </section>
    </>
  );
}
