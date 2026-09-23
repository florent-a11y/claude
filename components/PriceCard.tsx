import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { PRICING, money } from "@/lib/pricing";

export async function PriceCard({ compact = false }: { compact?: boolean }) {
  const t = await getTranslations("PriceCard");
  const locale = await getLocale();
  const m = (cents: number) => money(cents, PRICING.currency, intlLocale(locale));
  return (
    <div className="card border-brand-100">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t("title")}</p>
      <ul className="mt-4 divide-y divide-slate-100 text-ink-700">
        <li className="flex items-center justify-between py-3"><span>{t("first")}</span><strong className="text-xl text-ink-900">{m(PRICING.arrivalCard.first)}</strong></li>
        <li className="flex items-center justify-between py-3"><span>{t("additional")}</span><strong>{m(PRICING.arrivalCard.additional)}</strong></li>
        <li className="flex items-center justify-between py-3"><span>{t("evoa")}</span><strong>{t("from", { price: m(PRICING.evoa.first + PRICING.evoa.governmentFee) })}</strong></li>
        <li className="flex items-center justify-between py-3"><span>{t("express", { hours: PRICING.arrivalCard.expressSlaHours })}</span><strong>{t("plus", { price: m(PRICING.express) })}</strong></li>
      </ul>
      {!compact && <p className="mt-4 text-sm text-ink-500">{t("note")}</p>}
      <Link href="/apply" className="btn-primary mt-5 w-full">{t("cta")}</Link>
    </div>
  );
}
