import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { productsOf } from "@/lib/catalog";
import { idr } from "@/lib/money";
import { pageMetadata } from "@/i18n/seo";
import { PageHeader } from "@/components/PageHeader";
import { AddToCart } from "@/components/cart";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing.memberships" });
  return pageMetadata(locale, "/memberships", { title: t("title"), description: t("intro") });
}

export default async function Memberships({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Listing.memberships");
  const c = await getTranslations("Common");
  const cat = await getTranslations("Catalog.items");
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <section className="container-page py-14">
        <div className="grid gap-6 lg:grid-cols-3">
          {productsOf("membership").map((p) => {
            const dark = Boolean(p.featured);
            return (
              <article key={p.slug} className={`flex flex-col rounded-[2rem] border p-8 ${dark ? "border-forest-900 bg-forest-900 text-sand-100 shadow-2xl lg:-my-4" : "border-sand-200 bg-white/70"}`}>
                {dark && <span className="mb-4 self-start rounded-full bg-gold-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-forest-950">{t("popular")}</span>}
                <h2 className={`font-display text-4xl font-semibold ${dark ? "text-sand-50" : "text-forest-900"}`}>{cat(`${p.slug}.name`)}</h2>
                <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-sand-200/85" : "text-ink-700"}`}>{cat(`${p.slug}.tagline`)}</p>
                <p className="mt-6">
                  <span className={`font-display text-4xl font-semibold ${dark ? "text-sand-50" : "text-forest-900"}`}>{idr(p.priceIdr, locale)}</span>
                  <span className={`ml-2 text-sm ${dark ? "text-sand-200/70" : "text-ink-500"}`}>{c("perMonth")}</span>
                </p>
                <p className={`mt-7 text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-gold-400" : "text-clay-500"}`}>{t("includes")}</p>
                <ul className="mt-3 flex-1 space-y-2.5 text-sm">
                  {cat(`${p.slug}.contents`).split(";").map((perk) => (
                    <li key={perk} className="flex gap-2.5"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-gold-400" : "text-forest-600"}`} aria-hidden="true" />{perk.trim()}</li>
                  ))}
                </ul>
                <div className="mt-8"><AddToCart slug={p.slug} session={false} className={dark ? "btn-light" : "btn-primary"} /></div>
              </article>
            );
          })}
        </div>
        <p className="mt-14 max-w-3xl border-l-2 border-clay-400 pl-4 text-sm leading-relaxed text-ink-500">{t("note")}</p>
      </section>
    </>
  );
}
