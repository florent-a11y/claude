import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ArrowUpRight, BookOpenCheck, Check, HeartPulse, MapPin, ShieldCheck, Snowflake, Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PRODUCTS, getProduct } from "@/lib/catalog";
import { FREE_DELIVERY_FROM_IDR, ZONES, site } from "@/lib/config";
import { idr } from "@/lib/money";
import type { PhotoKey } from "@/lib/photos";
import { Photo } from "@/components/Photo";
import { ProductCard } from "@/components/ProductCard";
import { FaqList } from "@/components/Faq";
import { WhatsAppLink } from "@/components/WhatsAppLink";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const c = await getTranslations("Common");
  const f = await getTranslations("Faq");
  const cat = await getTranslations("Catalog.items");
  const featured = PRODUCTS.filter((p) => p.featured);
  const star = getProduct("iv-hydration")!;
  const minDelivery = Math.min(...ZONES.map((z) => z.deliveryIdr));
  const minCallout = Math.min(...ZONES.map((z) => z.calloutIdr));

  const pillars: Array<{ href: "/iv-drips" | "/peptides" | "/supplements" | "/memberships"; key: "iv" | "peptides" | "supplements" | "memberships"; photo: PhotoKey }> = [
    { href: "/iv-drips", key: "iv", photo: "iv-drip-chamber" },
    { href: "/peptides", key: "peptides", photo: "vials-violet" },
    { href: "/supplements", key: "supplements", photo: "softgels-close" },
    { href: "/memberships", key: "memberships", photo: "infinity-pool" },
  ];
  const standards = [Stethoscope, BookOpenCheck, Snowflake, HeartPulse];

  return (
    <>
      {/* Hero */}
      <section className="overflow-hidden">
        <div className="container-page grid items-center gap-10 pb-14 pt-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-20 lg:pt-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-mist-200 bg-mist-50 px-3.5 py-1.5 text-xs font-semibold text-deep-700">
              <span className="h-2 w-2 rounded-full bg-tide-500" aria-hidden="true" />{t("hero.eyebrow")}
            </p>
            <h1 className="h-display mt-6 text-[2.6rem] sm:text-6xl lg:text-[4.1rem]">{t("hero.title")}</h1>
            <p className="lead mt-6 max-w-xl">{t("hero.text")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/iv-drips" className="btn-primary">{t("hero.ctaPrimary")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link href="/peptides" className="btn-secondary">{t("hero.ctaSecondary")}</Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-ink-700">
              {[t("hero.badge1"), t("hero.badge2"), t("hero.badge3")].map((b) => (
                <li key={b} className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-tide-600" aria-hidden="true" />{b}</li>
              ))}
            </ul>
          </div>

          {/* Photo mosaic: one tall lifestyle picture, two product pictures. Described once, on the wrapper. */}
          <div className="relative" role="img" aria-label={t("hero.artAlt")}>
            <div className="grid h-[26rem] grid-cols-5 grid-rows-2 gap-3 sm:h-[32rem] lg:h-[38rem]">
              <Photo name="jungle-pool" sizes="(min-width: 1024px) 380px, 60vw" className="col-span-3 row-span-2 rounded-[2rem]" priority />
              <Photo name="iv-bag" sizes="(min-width: 1024px) 250px, 40vw" className="col-span-2 rounded-[2rem]" priority />
              <Photo name="vials-row" sizes="(min-width: 1024px) 250px, 40vw" className="col-span-2 rounded-[2rem]" priority />
            </div>
            <Link href={`/treatments/${star.slug}`} className="absolute bottom-5 left-5 flex max-w-[15rem] items-center gap-3 rounded-2xl bg-white/90 p-3 pr-4 shadow-xl backdrop-blur-md transition hover:-translate-y-0.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-400 text-deep-950"><ArrowUpRight className="h-5 w-5" aria-hidden="true" /></span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-tide-600">{t("hero.cardLabel")}</span>
                <span className="block text-sm font-semibold leading-tight text-deep-900">{cat(`${star.slug}.name`)}</span>
                <span className="block text-xs text-ink-700">{idr(star.priceIdr, locale)} · {c("minutes", { count: star.durationMin ?? 45 })}</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* What we offer: four photo cards */}
      <section className="container-page py-14 lg:py-20">
        <p className="eyebrow">{t("pillars.eyebrow")}</p>
        <h2 className="h-display mt-3 max-w-2xl text-4xl sm:text-5xl">{t("pillars.title")}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ href, key, photo }) => (
            <Link key={key} href={href} className="group relative block overflow-hidden rounded-[2rem]">
              <Photo name={photo} sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw" className="aspect-[4/5]" />
              <div className="absolute inset-0 bg-gradient-to-t from-deep-950/90 via-deep-950/35 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <h3 className="font-display text-2xl font-semibold">{t(`pillars.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/85">{t(`pillars.${key}.text`)}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-lime-400">{c("learnMore")}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-mist-200 bg-mist-50">
        <div className="container-page py-14 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="eyebrow">{t("how.eyebrow")}</p>
              <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("how.title")}</h2>
              <p className="lead mt-4">{t("how.text")}</p>
            </div>
            <Link href="/how-it-works" className="btn-secondary">{t("how.cta")}</Link>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["step1", "step2", "step3", "step4"] as const).map((s, i) => (
              <li key={s} className="rounded-3xl border border-mist-200 bg-white p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-deep-900 text-sm font-bold text-lime-400">{i + 1}</span>
                <h3 className="mt-5 font-display text-xl font-semibold text-deep-900">{t(`how.${s}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{t(`how.${s}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Featured */}
      <section className="container-page py-14 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("featured.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("featured.title")}</h2>
          </div>
          <Link href="/iv-drips" className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900 underline-offset-4 hover:underline">{t("featured.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </section>

      {/* Villa call-out */}
      <section className="container-page">
        <div className="grid overflow-hidden rounded-[2.5rem] bg-deep-950 text-white lg:grid-cols-2">
          <div className="p-8 sm:p-12 lg:p-16">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-400">{t("villa.eyebrow")}</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl" style={{ letterSpacing: "-0.04em" }}>{t("villa.title")}</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/75">{t("villa.text")}</p>
            <ul className="mt-8 space-y-3.5">
              {[t("villa.point1", { opens: site.opens, closes: site.closes }), t("villa.point2", { fee: idr(minCallout, locale) }), t("villa.point3")].map((p) => (
                <li key={p} className="flex gap-3 text-white/90"><Check className="mt-1 h-4 w-4 shrink-0 text-lime-400" aria-hidden="true" />{p}</li>
              ))}
            </ul>
            <div className="mt-9"><Link href="/delivery" className="btn-light">{t("villa.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
          </div>
          <Photo name="villa-terrace-pool" sizes="(min-width: 1024px) 640px, 100vw" className="min-h-[18rem] lg:min-h-full" />
        </div>
      </section>

      {/* Standards */}
      <section className="container-page py-14 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <Photo name="nurse-scrubs" sizes="(min-width: 1024px) 480px, 100vw" className="aspect-[4/3] rounded-[2rem] lg:aspect-[4/5]" />
          <div>
            <p className="eyebrow">{t("standards.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("standards.title")}</h2>
            <div className="mt-9 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {(["item1", "item2", "item3", "item4"] as const).map((key, i) => {
                const Icon = standards[i];
                return (
                  <div key={key}>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-tide-100 text-deep-700"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                    <h3 className="mt-4 font-display text-lg font-semibold text-deep-900">{t(`standards.${key}.title`)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t(`standards.${key}.text`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Areas: text over a photograph of the island */}
      <section className="container-page">
        <div className="relative overflow-hidden rounded-[2.5rem]">
          <Photo name="rice-terraces" sizes="(min-width: 1280px) 1216px, 100vw" className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-r from-deep-950/90 via-deep-950/70 to-deep-950/30" aria-hidden="true" />
          <div className="relative grid gap-8 p-8 text-white sm:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:p-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-400">{t("areas.eyebrow")}</p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl" style={{ letterSpacing: "-0.04em" }}>{t("areas.title")}</h2>
              <p className="mt-4 text-lg leading-relaxed text-white/80">{t("areas.text", { delivery: idr(minDelivery, locale), free: idr(FREE_DELIVERY_FROM_IDR, locale) })}</p>
              <Link href="/delivery" className="btn-light mt-7">{t("areas.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
            <ul className="flex flex-wrap gap-2">
              {ZONES.flatMap((z) => z.areas).map((a) => (
                <li key={a} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-sm font-medium text-white backdrop-blur-md"><MapPin className="h-3.5 w-3.5 text-lime-400" aria-hidden="true" />{a}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="container-page py-14 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("faq.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("faq.title")}</h2>
          </div>
          <Link href="/faq" className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900 underline-offset-4 hover:underline">{t("faq.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <div className="mt-8"><FaqList items={(["q1", "q3", "q5", "q8"] as const).map((k) => ({ q: f(`${k}.q`), a: f(`${k}.a`) }))} /></div>
      </section>

      {/* Final call to action */}
      <section className="container-page">
        <div className="relative overflow-hidden rounded-[2.5rem]">
          <Photo name="rice-field-palms" sizes="(min-width: 1280px) 1216px, 100vw" className="absolute inset-0" />
          <div className="absolute inset-0 bg-deep-950/65" aria-hidden="true" />
          <div className="relative px-6 py-16 text-center text-white sm:px-12 sm:py-20">
            <h2 className="font-display text-4xl font-semibold sm:text-5xl" style={{ letterSpacing: "-0.04em" }}>{t("final.title")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/85">{t("final.text")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <WhatsAppLink label={c("chatOnWhatsapp")} text={c("whatsappGeneral", { brand: site.name })} className="btn-light" />
              <Link href="/contact" className="btn-secondary border-white/0">{t("final.cta")}</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
