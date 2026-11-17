import { Plus } from "lucide-react";

/** Accordion built on <details>, so it works without JavaScript, plus FAQ structured data for search engines. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <>
      <div className="divide-y divide-sand-200 rounded-3xl border border-sand-200 bg-white">
        {items.map((item) => (
          <details key={item.q} className="group px-6 sm:px-7">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-bold text-ink-950 [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus size={22} aria-hidden="true" className="shrink-0 text-sea-600 transition group-open:rotate-45" />
            </summary>
            <p className="pb-6 pr-8 text-lg leading-relaxed text-ink-600">{item.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
