import Link from "next/link";
import { PRICING, money } from "@/lib/pricing";

export function PriceCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className="card border-brand-100">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Transparent price, shown before you type anything</p>
      <ul className="mt-4 divide-y divide-slate-100 text-ink-700">
        <li className="flex items-center justify-between py-3"><span>First traveler</span><strong className="text-xl text-ink-900">{money(PRICING.firstTraveler)}</strong></li>
        <li className="flex items-center justify-between py-3"><span>Each additional traveler (same booking)</span><strong>{money(PRICING.additionalTraveler)}</strong></li>
        <li className="flex items-center justify-between py-3"><span>Express, human-verified in under {PRICING.expressSlaHours} h (optional)</span><strong>+{money(PRICING.express)}</strong></li>
      </ul>
      {!compact && (
        <p className="mt-4 text-sm text-ink-500">
          No hidden fees, no upsell after you enter your details. Full refund if we do not deliver your card at least 6 hours before your arrival time.
        </p>
      )}
      <Link href="/apply" className="btn-primary mt-5 w-full">Start my arrival card</Link>
    </div>
  );
}
