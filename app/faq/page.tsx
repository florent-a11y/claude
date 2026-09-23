import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = { title: "FAQ – Indonesia arrival card", description: "Answers about the All Indonesia arrival card: who needs it, the 72-hour rule, the QR code, customs and our assistance service." };

const faqs = [
  { q: "What does the fee cover?", a: "Guided data collection, manual verification of every field, submission of your arrival card, delivery of the QR code by email and WhatsApp, and support until you have cleared immigration." },
  { q: "Who must complete it?", a: "All international arrivals to Indonesia by air, sea or land, including Indonesian citizens and children. Each traveler needs their own card." },
  { q: "When must it be submitted?", a: "Within 72 hours (3 days) before your scheduled arrival. Submitting earlier than 72 hours is not accepted by the system, so we schedule your submission inside that window." },
  { q: "What do I receive?", a: "A QR code, which you show with your passport at immigration and customs on arrival. We send it by email and WhatsApp as a PDF and an image." },
  { q: "Does the arrival card replace a visa?", a: "No. It is an arrival declaration (immigration, customs and health in one form). You still need visa-free entry, a Visa on Arrival, an e-VOA or another visa as applicable. We can prepare the e-VOA for you as well." },
  { q: "What is the e-VOA and who can use it?", a: "The electronic Visa on Arrival is a 30-day visa, extendable once for 30 days, available to around 97 nationalities for tourism, family visits, business meetings and transit. ASEAN nationals do not need it. Your passport must be valid for at least 6 months." },
  { q: "How is the e-VOA price made up?", a: "The government fee (IDR 500,000 plus the official portal's card charge, about USD 34) is passed through at cost and shown separately from our service fee. Government fees are non-refundable once the application is lodged; our service fee is refunded if you are not eligible or we cannot submit." },
  { q: "How long does the e-VOA take?", a: "Usually the same day, at most 2 working days after we submit. Apply at least 5 days before travel to be safe; the express option prioritizes verification and submission." },
  { q: "Which airports and ports use it?", a: "All major international entry points, including Jakarta (CGK), Bali (DPS), Surabaya (SUB), Medan (KNO), Makassar (UPG) and the Batam and Tanjung Pinang ferry terminals. Some airlines ask to see the QR before boarding." },
  { q: "What if I make a mistake?", a: "Details such as passport number must match exactly. That is the main reason people use our service: a person checks every field before submission." },
  { q: "Is my passport data safe?", a: "Data is encrypted, used only to prepare your card, never sold, and deleted 30 days after your arrival date. See our privacy policy." },
  { q: "Can I get a refund?", a: "Yes, in full if we do not deliver at least 6 hours before your arrival time or if you cancel before processing starts." },
  { q: "Are you the Indonesian government?", a: "No. We are a private assistance company, not affiliated with the Government of Indonesia, the Directorate General of Immigration or any government website." },
];

export default function FAQ() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <h1 className="text-3xl font-bold">Frequently asked questions</h1>
      <div className="mt-8 divide-y divide-slate-200">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <p className="mt-2 text-ink-700">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
