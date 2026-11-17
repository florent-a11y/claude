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
      <div className="space-y-3">
        {items.map((item) => (
          <details key={item.q} className="group rounded-2xl border border-white/10 bg-white/[0.03] px-6 transition open:border-gold-400/40 open:bg-white/[0.05] sm:px-7">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-bold text-white [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-gold-300 transition duration-300 group-open:rotate-45 group-open:border-gold-400/60">
                <Plus size={18} aria-hidden="true" />
              </span>
            </summary>
            <p className="pb-6 pr-8 text-lg leading-relaxed text-mist-300">{item.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
