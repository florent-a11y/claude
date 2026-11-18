import { useLocale, useTranslations } from "next-intl";
import { Clock, Snowflake, Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/lib/catalog";
import { idr } from "@/lib/money";
import { Photo } from "./Photo";
import { AddToCart } from "./cart";

/** Catalogue card: photograph with frosted labels, then name, price and the add button. Works in server and client components. */
export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("Catalog.items");
  const c = useTranslations("Common");
  const k = useTranslations("Kinds");
  const locale = useLocale();
  const href = `/treatments/${product.slug}` as const;
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-mist-200 bg-white transition duration-300 hover:-translate-y-0.5 hover:border-mist-300 hover:shadow-[0_28px_50px_-30px_rgba(6,32,31,0.4)]">
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <Photo name={product.photo} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className="aspect-[4/3]" />
        </Link>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-1.5">
          <span className="chip-glass">{k(product.kind)}</span>
          {product.rx && <span className="chip-glass text-coral-600"><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />{c("doctorReviewShort")}</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold leading-snug text-deep-900">
          <Link href={href} className="underline-offset-4 hover:underline">{t(`${product.slug}.name`)}</Link>
        </h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-700">{t(`${product.slug}.tagline`)}</p>
        {(product.durationMin || product.coldChain) && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-500">
            {product.durationMin && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{c("minutes", { count: product.durationMin })}</span>}
            {product.coldChain && <span className="inline-flex items-center gap-1.5"><Snowflake className="h-3.5 w-3.5" aria-hidden="true" />{c("coldChain")}</span>}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-mist-100 pt-4">
          <div>
            <p className="text-lg font-semibold text-deep-900">{idr(product.priceIdr, locale)}</p>
            <p className="text-xs text-ink-500">{t(`${product.slug}.unit`)}</p>
          </div>
          <AddToCart slug={product.slug} session={product.session} compact />
        </div>
      </div>
    </article>
  );
}
