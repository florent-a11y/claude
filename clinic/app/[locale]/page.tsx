import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Droplets, FlaskConical, Leaf, ShieldCheck, Snowflake, Sparkles, Stethoscope, HeartPulse, BookOpenCheck, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PRODUCTS, getProduct } from "@/lib/catalog";
import { FREE_DELIVERY_FROM_IDR, ZONES, site } from "@/lib/config";
import { idr } from "@/lib/money";
import { HeroArt } from "@/components/HeroArt";
import { ProductCard } from "@/components/ProductCard";
import { FaqList } from "@/components/Faq";
import { WhatsAppLink } from "@/components/WhatsAppLink";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const c = await getTranslations("Common");
  const n = await getTranslations("Nav");
  const f = await getTranslations("Faq");
  const cat = await getTranslations("Catalog.items");
  const featured = PRODUCTS.filter((p) => p.featured);
  const star = getProduct("iv-hydration")!;
  const minDelivery = Math.min(...ZONES.map((z) => z.deliveryIdr));
  const minCallout = Math.min(...ZONES.map((z) => z.calloutIdr));

  const pillars = [
    { href: "/iv-drips", icon: Droplets, key: "iv" },
    { href: "/peptides", icon: FlaskConical, key: "peptides" },
    { href: "/supplements", icon: Leaf, key: "supplements" },
    { href: "/memberships", icon: Sparkles, key: "memberships" },
  ] as const;
  const standards = [Stethoscope, BookOpenCheck, Snowflake, HeartPulse];

  return (
    <>
      {/* Hero */}
      <section className="grain overflow-hidden">
        <div className="container-page grid items-center gap-12 pb-16 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="eyebrow">{t("hero.eyebrow")}</p>
            <h1 className="h-display mt-5 text-[2.9rem] sm:text-6xl lg:text-7xl">{t("hero.title")}</h1>
            <p className="lead mt-6 max-w-xl">{t("hero.text")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/iv-drips" className="btn-primary">{t("hero.ctaPrimary")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link href="/peptides" className="btn-secondary">{t("hero.ctaSecondary")}</Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-ink-700">
              {[t("hero.badge1"), t("hero.badge2"), t("hero.badge3")].map((b) => (
                <li key={b} className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-forest-600" aria-hidden="true" />{b}</li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <HeroArt className="w-full drop-shadow-[0_30px_40px_rgba(28,47,39,0.18)]" label={t("hero.artAlt")} />
            <Link href={`/treatments/${star.slug}`} className="absolute -left-3 bottom-8 w-56 rounded-2xl border border-sand-200 bg-sand-50/95 p-4 shadow-xl backdrop-blur transition hover:-translate-y-0.5 sm:-left-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-clay-500">{t("hero.cardLabel")}</p>
              <p className="mt-1 font-display text-xl font-semibold leading-tight text-forest-900">{cat(`${star.slug}.name`)}</p>
              <p className="mt-1 text-sm text-ink-700">{idr(star.priceIdr, locale)} · {c("minutes", { count: star.durationMin ?? 45 })}</p>
            </Link>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="container-page py-16 lg:py-24">
        <p className="eyebrow">{t("pillars.eyebrow")}</p>
        <h2 className="h-display mt-3 max-w-2xl text-4xl sm:text-5xl">{t("pillars.title")}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ href, icon: Icon, key }) => (
            <Link key={key} href={href} className="card group flex flex-col transition hover:-translate-y-1 hover:border-sand-300">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-forest-700"><Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
              <h3 className="mt-5 font-display text-2xl font-semibold text-forest-900">{t(`pillars.${key}.title`)}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-700">{t(`pillars.${key}.text`)}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700">{c("learnMore")}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="grain border-y border-sand-200 bg-sand-100/70">
        <div className="container-page py-16 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow">{t("how.eyebrow")}</p>
              <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("how.title")}</h2>
              <p className="lead mt-5">{t("how.text")}</p>
              <Link href="/how-it-works" className="btn-secondary mt-8">{t("how.cta")}</Link>
            </div>
            <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
              {(["step1", "step2", "step3", "step4"] as const).map((s, i) => (
                <li key={s} className="border-t border-forest-800/20 pt-5">
                  <span className="font-display text-4xl font-medium text-clay-500">0{i + 1}</span>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-forest-900">{t(`how.${s}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{t(`how.${s}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="container-page py-16 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("featured.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("featured.title")}</h2>
          </div>
          <Link href="/iv-drips" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 underline-offset-4 hover:underline">{t("featured.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </section>

      {/* Villa call-out */}
      <section className="bg-forest-900 text-sand-100">
        <div className="container-page grid gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-400">{t("villa.eyebrow")}</p>
            <h2 className="mt-3 font-display text-4xl font-medium leading-tight text-sand-50 sm:text-5xl">{t("villa.title")}</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-sand-200/85">{t("villa.text")}</p>
          </div>
          <div className="flex flex-col justify-center">
            <ul className="space-y-4">
              {[t("villa.point1", { opens: site.opens, closes: site.closes }), t("villa.point2", { fee: idr(minCallout, locale) }), t("villa.point3")].map((p) => (
                <li key={p} className="flex gap-3 text-sand-100"><Check className="mt-1 h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />{p}</li>
              ))}
            </ul>
            <div className="mt-8"><Link href="/delivery" className="btn-light">{t("villa.cta")}</Link></div>
          </div>
        </div>
      </section>

      {/* Standards */}
      <section className="container-page py-16 lg:py-24">
        <p className="eyebrow">{t("standards.eyebrow")}</p>
        <h2 className="h-display mt-3 max-w-2xl text-4xl sm:text-5xl">{t("standards.title")}</h2>
        <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {(["item1", "item2", "item3", "item4"] as const).map((key, i) => {
            const Icon = standards[i];
            return (
              <div key={key} className="flex gap-4">
                <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sand-300 text-forest-700"><Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
                <div>
                  <h3 className="font-display text-2xl font-semibold text-forest-900">{t(`standards.${key}.title`)}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink-700">{t(`standards.${key}.text`)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Areas */}
      <section className="grain border-y border-sand-200 bg-sage-100/60">
        <div className="container-page py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow">{t("areas.eyebrow")}</p>
              <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("areas.title")}</h2>
              <p className="lead mt-4">{t("areas.text", { delivery: idr(minDelivery, locale), free: idr(FREE_DELIVERY_FROM_IDR, locale) })}</p>
              <Link href="/delivery" className="btn-secondary mt-7">{t("areas.cta")}</Link>
            </div>
            <ul className="flex flex-wrap gap-2">
              {ZONES.flatMap((z) => z.areas).map((a) => <li key={a} className="rounded-full border border-forest-800/15 bg-sand-50 px-4 py-2 text-sm font-medium text-forest-900">{a}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="container-page py-16 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("faq.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("faq.title")}</h2>
          </div>
          <Link href="/faq" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 underline-offset-4 hover:underline">{t("faq.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <div className="mt-8"><FaqList items={(["q1", "q3", "q5", "q8"] as const).map((k) => ({ q: f(`${k}.q`), a: f(`${k}.a`) }))} /></div>
      </section>

      {/* Final CTA */}
      <section className="container-page">
        <div className="grain overflow-hidden rounded-[2rem] border border-sand-200 bg-clay-50 px-6 py-14 text-center sm:px-12">
          <h2 className="h-display text-4xl sm:text-5xl">{t("final.title")}</h2>
          <p className="lead mx-auto mt-4 max-w-xl">{t("final.text")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <WhatsAppLink label={c("chatOnWhatsapp")} text={c("whatsappGeneral", { brand: site.name })} className="btn-primary" />
            <Link href="/contact" className="btn-secondary">{t("final.cta")}</Link>
          </div>
          <p className="sr-only">{n("contact")}</p>
        </div>
      </section>
    </>
  );
}
