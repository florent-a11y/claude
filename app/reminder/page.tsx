import type { Metadata } from "next";
import Link from "next/link";
import { ReminderForm } from "@/components/ReminderForm";
import { JsonLd } from "@/components/JsonLd";
import { DISCLOSURE, site } from "@/lib/config";
import { PRICING, money } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Indonesia arrival card: we tell you when to apply",
  description: "The official portal only accepts the All Indonesia arrival card within 72 hours before arrival. Leave your arrival date and we email you the moment your window opens. Free reminder, no payment now.",
};

const steps = [
  { n: 1, t: "Set a reminder", d: "Your email and arrival date. Takes 20 seconds. No payment, no account." },
  { n: 2, t: "Get the email when the window opens", d: "A short heads-up the day before, then a message the moment the portal accepts your date, with a link that has your details prefilled." },
  { n: 3, t: "We prepare and check your card, or you do it yourself", d: `Order our assistance from ${money(PRICING.arrivalCard.first)} and a person checks every field before submission. Or follow our free guide and submit on the official portal yourself.` },
];

const faqs = [
  { q: "Why can I not apply today?", a: "The official All Indonesia system only accepts arrival card submissions inside the 72 hours (3 days) before your scheduled arrival. Earlier submissions are rejected, which is why we do not take an order or payment before the window opens." },
  { q: "Is the reminder free?", a: "Yes. You receive at most two emails for your trip: a heads-up the day before and one when the window opens. Unsubscribe with one click." },
  { q: "Do I have to buy your service afterwards?", a: "No. The email includes a link to our guided form if you want a person to prepare and check the card, and a link to our free guide if you prefer to do it yourself on the official portal." },
  { q: "What about the e-VOA visa?", a: "The e-VOA has no 72-hour limit and can be applied for up to 90 days before arrival. If you need one, you can order it now and set the reminder for the arrival card only." },
  { q: "Are you the Indonesian government?", a: "No. We are a private assistance company, not affiliated with the Government of Indonesia, the Directorate General of Immigration or any government website." },
];

export default async function ReminderPage({ searchParams }: { searchParams: Promise<{ unsubscribed?: string; arrival?: string; email?: string }> }) {
  const sp = await searchParams;
  const initialArrival = sp.arrival && /^\d{4}-\d{2}-\d{2}$/.test(sp.arrival) ? sp.arrival : "";
  const initialEmail = sp.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sp.email) ? sp.email : "";
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">Free reminder, no payment now</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Indonesia arrival card: we tell you when to apply</h1>
            <p className="mt-5 text-lg text-ink-700">
              The official portal only accepts the arrival card within 72 hours before you land. Apply earlier and it is rejected. Leave your arrival date and we email you the moment your window opens.
            </p>
            <ul className="mt-6 space-y-2 text-ink-700">
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span> One email the day before, one when the window opens</li>
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span> Your details prefilled in the link, so it takes two minutes</li>
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span> Then choose: we prepare and check your card, or you do it yourself</li>
            </ul>
            <p className="mt-6 text-sm text-ink-500">Private assistance service, not affiliated with any government website. <Link className="underline" href="/legal/disclosure">Read our disclosure</Link>.</p>
          </div>
          <div id="reminder-form" className="card border-brand-100 scroll-mt-24">
            {sp.unsubscribed === "1" && <p className="mb-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-ink-700">You have been unsubscribed. We will not email you about this trip again.</p>}
            {sp.unsubscribed === "0" && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">That unsubscribe link is not valid or has already been used. Write to {site.supportEmail} if you keep receiving emails.</p>}
            <h2 className="text-xl font-bold">Get the reminder</h2>
            <p className="mt-1 text-sm text-ink-500">We compute the exact moment the 72-hour window opens for your date.</p>
            <div className="mt-4"><ReminderForm initialArrival={initialArrival} initialEmail={initialEmail} /></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">The 72-hour rule, in short</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="card">
            <p className="text-ink-700">Every traveler entering Indonesia by air, sea or land needs an All Indonesia arrival card: one online form for immigration, customs and health, which produces a QR code shown on arrival.</p>
            <p className="mt-3 text-ink-700">The system opens the form only inside the 72 hours before the arrival date. If you try before, the submission is refused. Most travelers only discover this when they sit down to fill it in a week ahead, then forget it in the rush before the flight.</p>
          </div>
          <div className="card">
            <p className="text-ink-700">A reminder solves that. Tell us your arrival date and we work out when the window opens for you and send a single email at that moment. Nothing is charged until you decide, inside the window, whether you want our assistance.</p>
            <p className="mt-3 text-ink-700">If you also need a visa, the e-VOA can be applied for up to 90 days ahead. <Link className="underline" href="/evoa">See e-VOA assistance</Link>.</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-bold text-white">{s.n}</span>
                <h3 className="mt-4 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-ink-700">{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#reminder-form" className="btn-primary">Set my reminder</a>
            <Link href="/guide" className="btn-secondary">Read the free guide</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-ink-700">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{DISCLOSURE}</p>
      </section>
    </>
  );
}
