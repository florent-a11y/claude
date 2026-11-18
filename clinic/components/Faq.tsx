import { ChevronDown } from "lucide-react";

/** Accordion built on <details>: works without JavaScript and is keyboard-friendly by default. */
export function FaqList({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div className="divide-y divide-mist-200 border-y border-mist-200">
      {items.map((item) => (
        <details key={item.q} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left font-display text-lg font-semibold text-deep-900 [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-tide-600 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="max-w-3xl pb-5 leading-relaxed text-ink-700">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
