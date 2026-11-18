import { useLocale, useTranslations } from "next-intl";
import { Clock, Snowflake, Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/lib/catalog";
import { idr } from "@/lib/money";
import { ProductArt } from "./ProductArt";
import { AddToCart } from "./cart";

/** Catalogue card. Works in server and client components. */
export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("Catalog.items");
  const c = useTranslations("Common");
  const k = useTranslations("Kinds");
  const locale = useLocale();
  const href = `/treatments/${product.slug}` as const;
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-sand-200 bg-white/70 shadow-[0_12px_32px_-22px_rgba(28,47,39,0.25)] transition hover:shadow-[0_18px_40px_-20px_rgba(28,47,39,0.3)]">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block overflow-hidden">
        <ProductArt kind={product.kind} tone={product.tone} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-[1.03]" />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip">{k(product.kind)}</span>
          {product.rx && <span className="chip-rx"><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />{c("doctorReviewShort")}</span>}
          {product.durationMin && <span className="chip"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{c("minutes", { count: product.durationMin })}</span>}
          {product.coldChain && <span className="chip"><Snowflake className="h-3.5 w-3.5" aria-hidden="true" />{c("coldChain")}</span>}
        </div>
        <h3 className="mt-3 font-display text-2xl font-semibold leading-tight text-forest-900">
          <Link href={href} className="underline-offset-4 hover:underline">{t(`${product.slug}.name`)}</Link>
        </h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-700">{t(`${product.slug}.tagline`)}</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-forest-900">{idr(product.priceIdr, locale)}</p>
            <p className="text-xs text-ink-500">{t(`${product.slug}.unit`)}</p>
          </div>
          <AddToCart slug={product.slug} session={product.session} compact />
        </div>
      </div>
    </article>
  );
}
