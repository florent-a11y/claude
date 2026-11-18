import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { productsOf } from "@/lib/catalog";
import { idr } from "@/lib/money";
import { pageSeo } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { AddToCart } from "@/components/cart";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageSeo(locale, "/memberships");
}

export default async function Memberships({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Listing.memberships");
  const c = await getTranslations("Common");
  const cat = await getTranslations("Catalog.items");
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} photo="villa-poolside-palms" />
      <section className="container-page py-14">
        <div className="grid gap-6 lg:grid-cols-3">
          {productsOf("membership").map((p, i) => {
            const dark = Boolean(p.featured);
            return (
              <Reveal key={p.slug} index={i} className={dark ? "lg:-my-4" : ""}>
              <article className={`group flex h-full flex-col overflow-hidden rounded-[2rem] border transition duration-300 hover:-translate-y-1 ${dark ? "border-deep-950 bg-deep-950 text-white shadow-2xl" : "border-mist-200 bg-white hover:shadow-[0_28px_50px_-30px_rgba(6,32,31,0.4)]"}`}>
                <div className="relative">
                  <Photo name={p.photo} sizes="(min-width: 1024px) 400px, 100vw" className="aspect-[16/10]" />
                  {dark && <span className="absolute left-4 top-4 rounded-full bg-lime-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-deep-950">{t("popular")}</span>}
                </div>
                <div className="flex flex-1 flex-col p-7">
                  <h2 className={`font-display text-3xl font-semibold ${dark ? "text-white" : "text-deep-900"}`}>{cat(`${p.slug}.name`)}</h2>
                  <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-white/75" : "text-ink-700"}`}>{cat(`${p.slug}.tagline`)}</p>
                  <p className="mt-6">
                    <span className={`font-display text-3xl font-semibold ${dark ? "text-white" : "text-deep-900"}`}>{idr(p.priceIdr, locale)}</span>
                    <span className={`ml-2 text-sm ${dark ? "text-white/60" : "text-ink-500"}`}>{c("perMonth")}</span>
                  </p>
                  <p className={`mt-7 text-xs font-semibold uppercase tracking-[0.16em] ${dark ? "text-lime-400" : "text-tide-600"}`}>{t("includes")}</p>
                  <ul className="mt-3 flex-1 space-y-2.5 text-sm">
                    {cat(`${p.slug}.contents`).split(";").map((perk) => (
                      <li key={perk} className="flex gap-2.5"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-lime-400" : "text-tide-600"}`} aria-hidden="true" />{perk.trim()}</li>
                    ))}
                  </ul>
                  <div className="mt-8"><AddToCart slug={p.slug} session={false} className={dark ? "btn-light" : "btn-primary"} /></div>
                </div>
              </article>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-14 max-w-3xl border-l-2 border-tide-400 pl-4 text-sm leading-relaxed text-ink-500">{t("note")}</p>
      </section>
    </>
  );
}
