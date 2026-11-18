"use client";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus, Stethoscope, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { quote } from "@/lib/pricing";
import { idr } from "@/lib/money";
import { useCart } from "./cart";
import { ProductArt } from "./ProductArt";

export function CartView() {
  const t = useTranslations("Cart");
  const c = useTranslations("Common");
  const cat = useTranslations("Catalog.items");
  const locale = useLocale();
  const { items, ready, setQty, remove } = useCart();
  if (!ready) return <div className="min-h-64" aria-busy="true" />;
  const q = quote(items);

  if (q.lines.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="lead">{t("empty")}</p>
        <Link href="/iv-drips" className="btn-primary mt-6">{t("emptyCta")}</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
      <ul className="divide-y divide-sand-200 border-y border-sand-200">
        {q.lines.map((line) => (
          <li key={line.slug} className="flex gap-4 py-5">
            <Link href={`/treatments/${line.slug}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
              <ProductArt kind={line.product.kind} tone={line.product.tone} className="h-20 w-24 rounded-2xl sm:h-24 sm:w-32" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold leading-tight text-forest-900"><Link href={`/treatments/${line.slug}`} className="underline-offset-4 hover:underline">{cat(`${line.slug}.name`)}</Link></h2>
                  <p className="mt-0.5 text-sm text-ink-500">{cat(`${line.slug}.unit`)}</p>
                </div>
                <p className="whitespace-nowrap font-semibold text-forest-900">{idr(line.unitIdr * line.qty, locale)}</p>
              </div>
              {line.rx && <p className="chip-rx mt-2"><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />{c("doctorReview")}</p>}
              <div className="mt-3 flex items-center gap-4">
                {line.product.kind !== "membership" && (
                  <div className="inline-flex items-center rounded-full border border-sand-300" role="group" aria-label={t("quantity")}>
                    <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-sand-100" aria-label={t("decrease")} onClick={() => setQty(line.slug, line.qty - 1)}><Minus className="h-4 w-4" aria-hidden="true" /></button>
                    <span className="w-7 text-center text-sm font-semibold" aria-live="polite">{line.qty}</span>
                    <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-sand-100 disabled:opacity-40" aria-label={t("increase")} disabled={line.qty >= 10} onClick={() => setQty(line.slug, line.qty + 1)}><Plus className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                )}
                <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-red-700" onClick={() => remove(line.slug)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />{t("remove")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <aside className="card h-fit lg:sticky lg:top-28">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-500">{t("subtotal")}</span>
          <span className="font-display text-3xl font-semibold text-forest-900">{idr(q.subtotalIdr, locale)}</span>
        </div>
        <p className="mt-2 text-sm text-ink-500">{t("feesNote")}</p>
        {q.hasRx && <p className="mt-4 rounded-2xl bg-clay-50 px-4 py-3 text-sm leading-relaxed text-forest-900">{t("rxNote")}</p>}
        {q.hasSession && <p className="mt-3 rounded-2xl bg-sage-100 px-4 py-3 text-sm leading-relaxed text-forest-900">{t("sessionNote")}</p>}
        <Link href="/checkout" className="btn-primary mt-6 w-full">{t("checkout")}</Link>
        <Link href="/iv-drips" className="mt-4 block text-center text-sm font-semibold text-forest-700 underline-offset-4 hover:underline">{t("continue")}</Link>
      </aside>
    </div>
  );
}
