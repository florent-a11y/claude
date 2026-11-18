import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Clock, Snowflake, Stethoscope, Syringe, Truck, CalendarCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageSeo } from "@/lib/seo";
import { KIND_PATH, PRODUCTS, getProduct } from "@/lib/catalog";
import { site } from "@/lib/config";
import { idr } from "@/lib/money";
import { Photo } from "@/components/Photo";
import { ProductCard } from "@/components/ProductCard";
import { AddToCart } from "@/components/cart";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => PRODUCTS.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return pageSeo(locale, `/treatments/${slug}`);
}

const SECTION_LABEL = { "/iv-drips": "ivDrips", "/peptides": "peptides", "/supplements": "supplements", "/memberships": "memberships" } as const;

export default async function Treatment({ params }: Props) {
  const { locale, slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Product");
  const cat = await getTranslations("Catalog.items");
  const c = await getTranslations("Common");
  const k = await getTranslations("Kinds");
  const g = await getTranslations("Goals");
  const n = await getTranslations("Nav");
  const section = KIND_PATH[product.kind];
  const name = cat(`${slug}.name`);
  const related = PRODUCTS.filter((p) => p.slug !== slug && p.kind === product.kind).slice(0, 3);

  const facts = [
    product.rx && { icon: Stethoscope, title: t("reviewTitle"), text: t("reviewText"), accent: true },
    product.session && { icon: Syringe, title: t("sessionTitle"), text: t("sessionText") },
    !product.session && product.kind !== "membership" && { icon: Truck, title: t("deliveryTitle"), text: `${t("deliveryText")}${product.coldChain ? ` ${t("coldChainText")}` : ""}` },
    product.kind === "membership" && { icon: CalendarCheck, title: t("membershipTitle"), text: t("membershipText") },
  ].filter((x): x is { icon: typeof Stethoscope; title: string; text: string; accent?: boolean } => Boolean(x));

  return (
    <div className="container-page py-10 lg:py-14">
      <Link href={section} className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep-700 underline-offset-4 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back", { section: n(SECTION_LABEL[section]) })}
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Photo name={product.photo} sizes="(min-width: 1024px) 600px, 100vw" className="load-scale kenburns aspect-[4/3] w-full rounded-[2rem]" priority />
          <p className="mt-2.5 text-xs text-ink-500">{t("illustrative")}</p>
        </div>
        <div>
          <div className="load-rise flex flex-wrap items-center gap-1.5">
            <span className="chip">{k(product.kind)}</span>
            {product.rx && <span className="chip-rx"><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />{c("doctorReview")}</span>}
            {product.durationMin && <span className="chip"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{c("minutes", { count: product.durationMin })}</span>}
            {product.coldChain && <span className="chip"><Snowflake className="h-3.5 w-3.5" aria-hidden="true" />{c("coldChain")}</span>}
          </div>
          <h1 className="h-display load-rise mt-4 text-4xl sm:text-5xl" style={{ "--i": 1 } as React.CSSProperties}>{name}</h1>
          <p className="lead load-rise mt-3" style={{ "--i": 2 } as React.CSSProperties}>{cat(`${slug}.tagline`)}</p>
          <p className="load-rise mt-6" style={{ "--i": 3 } as React.CSSProperties}>
            <span className="font-display text-3xl font-semibold text-deep-900">{idr(product.priceIdr, locale)}</span>
            <span className="ml-3 text-sm text-ink-500">{cat(`${slug}.unit`)}</span>
          </p>
          <div className="load-rise mt-6 flex flex-wrap items-center gap-3" style={{ "--i": 4 } as React.CSSProperties}>
            <AddToCart slug={slug} session={product.session} />
            <WhatsAppLink label={t("question")} text={c("whatsappProduct", { brand: site.name, product: name })} className="btn-secondary" />
          </div>

          <p className="mt-9 leading-relaxed text-ink-700">{cat(`${slug}.description`)}</p>

          {product.goals.length > 0 && (
            <div className="mt-7">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-tide-600">{t("goodFor")}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">{product.goals.map((goal) => <li key={goal} className="chip">{g(goal)}</li>)}</ul>
            </div>
          )}

          <div className="mt-7">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-tide-600">{product.kind === "membership" ? t("includes") : t("contents")}</h2>
            <ul className="mt-3 divide-y divide-mist-200 border-y border-mist-200 text-sm text-ink-700">
              {cat(`${slug}.contents`).split(";").map((item) => <li key={item} className="py-2.5">{item.trim()}</li>)}
            </ul>
          </div>

          <div className="mt-8 space-y-3">
            {facts.map(({ icon: Icon, title, text, accent }, i) => (
              <Reveal key={title} index={i} className={`flex gap-4 rounded-2xl p-5 ${accent ? "bg-coral-50" : "bg-mist-50"}`}>
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${accent ? "text-coral-600" : "text-deep-700"}`} strokeWidth={1.6} aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-deep-900">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-xs leading-relaxed text-ink-500">{t("disclaimer")}</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="h-display text-4xl">{t("related")}</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((p, i) => <Reveal key={p.slug} index={i}><ProductCard product={p} /></Reveal>)}</div>
        </section>
      )}
    </div>
  );
}
