import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ArrowUpRight, BookOpenCheck, Check, HeartPulse, MapPin, ShieldCheck, Snowflake, Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PRODUCTS, getProduct } from "@/lib/catalog";
import { AREAS, FREE_DELIVERY_FROM_IDR, ZONES, site } from "@/lib/config";
import { idr } from "@/lib/money";
import type { PhotoKey } from "@/lib/photos";
import { Photo } from "@/components/Photo";
import { ProductCard } from "@/components/ProductCard";
import { FaqList } from "@/components/Faq";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { Reveal } from "@/components/Reveal";
import { CountUp } from "@/components/CountUp";
import { Marquee } from "@/components/Marquee";
import { PostCard } from "@/components/PostCard";
import { publishedPosts } from "@/lib/posts";

/** Rebuilt at most every five minutes so new articles appear, and at once when one is saved. */
export const revalidate = 300;

/** CSS custom property that staggers an animation among its neighbours. */
const order = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const c = await getTranslations("Common");
  const f = await getTranslations("Faq");
  const g = await getTranslations("Goals");
  const n = await getTranslations("Nav");
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
  const keywords = [n("ivDrips"), g("hydration"), n("peptides"), g("recovery"), g("energy"), g("immunity"), g("longevity"), g("skin"), g("metabolic"), g("sleep")];
  const stats = [
    { value: AREAS.length, suffix: "", label: t("stats.areas", { count: AREAS.length }) },
    { value: PRODUCTS.length, suffix: "", label: t("stats.products", { count: PRODUCTS.length }) },
    { value: 7, suffix: "", label: t("stats.days", { opens: site.opens, closes: site.closes }) },
    { value: 100, suffix: "%", label: t("stats.reviewed") },
  ];
  const title = t("hero.title").split(" ");
  const b = await getTranslations("Blog");
  const posts = (await publishedPosts(locale)).slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative isolate -mt-[4.25rem] overflow-hidden pt-[4.25rem]">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="glow glow-a" />
          <div className="glow glow-b" />
        </div>
        <div className="container-page grid items-center gap-10 pb-14 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-20 lg:pt-16">
          <div>
            <p className="load-rise inline-flex items-center gap-2.5 rounded-full border border-mist-200 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-deep-700 backdrop-blur">
              <span className="ping relative inline-flex h-2 w-2 rounded-full bg-tide-500 text-tide-500" aria-hidden="true" />{t("hero.eyebrow")}
            </p>
            <h1 className="h-display mt-6 text-[2.6rem] sm:text-6xl lg:text-[4.1rem]">
              {title.map((word, i) => (
                <span key={`${word}-${i}`}><span className="word"><span style={order(i)}>{word}</span></span>{i < title.length - 1 ? " " : ""}</span>
              ))}
            </h1>
            <p className="lead load-rise mt-6 max-w-xl" style={order(4)}>{t("hero.text")}</p>
            <div className="load-rise mt-8 flex flex-wrap gap-3" style={order(5)}>
              <Link href="/iv-drips" className="btn-primary">{t("hero.ctaPrimary")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link href="/peptides" className="btn-secondary">{t("hero.ctaSecondary")}</Link>
            </div>
            <ul className="load-rise mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-ink-700" style={order(6)}>
              {[t("hero.badge1"), t("hero.badge2"), t("hero.badge3")].map((b) => (
                <li key={b} className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-tide-600" aria-hidden="true" />{b}</li>
              ))}
            </ul>
          </div>

          {/* Photo mosaic: one tall lifestyle picture, two product pictures. Described once, on the wrapper. */}
          <div className="relative" role="img" aria-label={t("hero.artAlt")}>
            <div className="grid h-[26rem] grid-cols-5 grid-rows-2 gap-3 sm:h-[32rem] lg:h-[38rem]">
              <Photo name="jungle-pool" sizes="(min-width: 1024px) 380px, 60vw" className="load-scale kenburns col-span-3 row-span-2 rounded-[2rem]" priority />
              <div className="load-scale col-span-2" style={order(2)}><Photo name="iv-bag" sizes="(min-width: 1024px) 250px, 40vw" className="h-full rounded-[2rem]" priority /></div>
              <div className="load-scale col-span-2" style={order(3)}><Photo name="vials-row" sizes="(min-width: 1024px) 250px, 40vw" className="h-full rounded-[2rem]" priority /></div>
            </div>
            <div className="load-rise absolute bottom-5 left-5" style={order(7)}>
              <Link href={`/treatments/${star.slug}`} className="float flex max-w-[15rem] items-center gap-3 rounded-2xl bg-white/90 p-3 pr-4 shadow-xl backdrop-blur-md">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-400 text-deep-950"><ArrowUpRight className="h-5 w-5" aria-hidden="true" /></span>
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-tide-600">{t("hero.cardLabel")}</span>
                  <span className="block text-sm font-semibold leading-tight text-deep-900">{cat(`${star.slug}.name`)}</span>
                  <span className="block text-xs text-ink-700">{idr(star.priceIdr, locale)} · {c("minutes", { count: star.durationMin ?? 45 })}</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Keywords drifting across a dark band */}
      <Marquee items={keywords} />

      {/* Numbers */}
      <section className="border-b border-mist-200">
        <dl className="container-page grid grid-cols-2 gap-y-8 py-10 lg:grid-cols-4 lg:py-12">
          {stats.map((s, i) => (
            <Reveal key={s.label} index={i} className="px-2 text-center lg:border-l lg:border-mist-200 lg:first:border-l-0">
              <dd className="font-display text-5xl font-semibold text-deep-900 sm:text-6xl" style={{ letterSpacing: "-0.05em" }}><CountUp value={s.value} suffix={s.suffix} /></dd>
              <dt className="mx-auto mt-2 max-w-[14rem] text-sm leading-snug text-ink-700">{s.label}</dt>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* What we offer: four photo cards */}
      <section className="container-page py-14 lg:py-20">
        <Reveal>
          <p className="eyebrow">{t("pillars.eyebrow")}</p>
          <h2 className="h-display mt-3 max-w-2xl text-4xl sm:text-5xl">{t("pillars.title")}</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ href, key, photo }, i) => (
            <Reveal key={key} index={i} variant="scale">
              <Link href={href} className="group relative block overflow-hidden rounded-[2rem]">
                <Photo name={photo} sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw" className="aspect-[4/5]" />
                <div className="absolute inset-0 bg-gradient-to-t from-deep-950/90 via-deep-950/35 to-transparent transition-opacity duration-500 group-hover:opacity-90" aria-hidden="true" />
                <span className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition duration-300 group-hover:bg-lime-400 group-hover:text-deep-950" aria-hidden="true"><ArrowUpRight className="h-5 w-5" /></span>
                <div className="absolute inset-x-0 bottom-0 p-6 text-white transition-transform duration-500 group-hover:-translate-y-1">
                  <h3 className="font-display text-2xl font-semibold">{t(`pillars.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/85">{t(`pillars.${key}.text`)}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-lime-400">{c("learnMore")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-mist-200 bg-mist-50">
        <div className="container-page py-14 lg:py-20">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="eyebrow">{t("how.eyebrow")}</p>
              <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("how.title")}</h2>
              <p className="lead mt-4">{t("how.text")}</p>
            </div>
            <Link href="/how-it-works" className="btn-secondary">{t("how.cta")}</Link>
          </Reveal>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["step1", "step2", "step3", "step4"] as const).map((s, i) => (
              <Reveal as="li" key={s} index={i}>
                <div className="group h-full rounded-3xl border border-mist-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-mist-300 hover:shadow-[0_24px_40px_-28px_rgba(6,32,31,0.4)]">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-deep-900 text-sm font-bold text-lime-400 transition duration-300 group-hover:scale-110 group-hover:bg-lime-400 group-hover:text-deep-950">{i + 1}</span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-deep-900">{t(`how.${s}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{t(`how.${s}.text`)}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Featured */}
      <section className="container-page py-14 lg:py-20">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("featured.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("featured.title")}</h2>
          </div>
          <Link href="/iv-drips" className="nav-link inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900">{t("featured.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p, i) => <Reveal key={p.slug} index={i % 3}><ProductCard product={p} /></Reveal>)}
        </div>
      </section>

      {/* Villa call-out */}
      <section className="container-page">
        <Reveal variant="scale">
          <div className="grid overflow-hidden rounded-[2.5rem] bg-deep-950 text-white lg:grid-cols-2">
            <div className="relative p-8 sm:p-12 lg:p-16">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-400">{t("villa.eyebrow")}</p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl" style={{ letterSpacing: "-0.04em" }}>{t("villa.title")}</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/75">{t("villa.text")}</p>
              <ul className="mt-8 space-y-3.5">
                {[t("villa.point1", { opens: site.opens, closes: site.closes }), t("villa.point2", { fee: idr(minCallout, locale) }), t("villa.point3")].map((p, i) => (
                  <Reveal as="li" key={p} index={i + 2} variant="left" className="flex gap-3 text-white/90"><Check className="mt-1 h-4 w-4 shrink-0 text-lime-400" aria-hidden="true" />{p}</Reveal>
                ))}
              </ul>
              <div className="mt-9"><Link href="/delivery" className="btn-light">{t("villa.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
            </div>
            <Photo name="villa-terrace-pool" sizes="(min-width: 1024px) 640px, 100vw" className="parallax min-h-[18rem] lg:min-h-full" />
          </div>
        </Reveal>
      </section>

      {/* Standards */}
      <section className="container-page py-14 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <Reveal variant="left"><Photo name="nurse-scrubs" sizes="(min-width: 1024px) 480px, 100vw" className="parallax aspect-[4/3] rounded-[2rem] lg:aspect-[4/5]" /></Reveal>
          <div>
            <Reveal>
              <p className="eyebrow">{t("standards.eyebrow")}</p>
              <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("standards.title")}</h2>
            </Reveal>
            <div className="mt-9 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {(["item1", "item2", "item3", "item4"] as const).map((key, i) => {
                const Icon = standards[i];
                return (
                  <Reveal key={key} index={i} className="group">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-tide-100 text-deep-700 transition duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-lime-400 group-hover:text-deep-950"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                    <h3 className="mt-4 font-display text-lg font-semibold text-deep-900">{t(`standards.${key}.title`)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t(`standards.${key}.text`)}</p>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Areas: text over a photograph of the island */}
      <section className="container-page">
        <Reveal variant="scale">
          <div className="relative overflow-hidden rounded-[2.5rem]">
            <Photo name="rice-terraces" sizes="(min-width: 1280px) 1216px, 100vw" className="parallax absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-r from-deep-950/90 via-deep-950/70 to-deep-950/30" aria-hidden="true" />
            <div className="relative grid gap-8 p-8 text-white sm:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:p-16">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-400">{t("areas.eyebrow")}</p>
                <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl" style={{ letterSpacing: "-0.04em" }}>{t("areas.title")}</h2>
                <p className="mt-4 text-lg leading-relaxed text-white/80">{t("areas.text", { delivery: idr(minDelivery, locale), free: idr(FREE_DELIVERY_FROM_IDR, locale) })}</p>
                <Link href="/delivery" className="btn-light mt-7">{t("areas.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              <ul className="flex flex-wrap gap-2">
                {AREAS.map((a, i) => (
                  <Reveal as="li" key={a} index={i * 0.6} variant="scale" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-sm font-medium text-white backdrop-blur-md"><MapPin className="h-3.5 w-3.5 text-lime-400" aria-hidden="true" />{a}</Reveal>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Journal: newest articles */}
      {posts.length > 0 && (
        <section className="container-page pt-14 lg:pt-20">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{b("latest")}</p>
              <h2 className="h-display mt-3 text-4xl sm:text-5xl">{b("latestTitle")}</h2>
            </div>
            <Link href="/blog" className="nav-link inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900">{b("all")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => <Reveal key={p.id} index={i}><PostCard post={p} /></Reveal>)}
          </div>
        </section>
      )}

      {/* FAQ teaser */}
      <section className="container-page py-14 lg:py-20">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("faq.eyebrow")}</p>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">{t("faq.title")}</h2>
          </div>
          <Link href="/faq" className="nav-link inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900">{t("faq.cta")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Reveal>
        <Reveal className="mt-8" index={1}><FaqList items={(["q1", "q3", "q5", "q8"] as const).map((k) => ({ q: f(`${k}.q`), a: f(`${k}.a`) }))} /></Reveal>
      </section>

      {/* Final call to action */}
      <section className="container-page">
        <Reveal variant="scale">
          <div className="relative overflow-hidden rounded-[2.5rem]">
            <Photo name="rice-field-palms" sizes="(min-width: 1280px) 1216px, 100vw" className="parallax absolute inset-0" />
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
        </Reveal>
      </section>
    </>
  );
}
