import type { Metadata } from "next";
import { Check } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { fill, getDictionary } from "@/content";
import { AUDIT_TIERS, formatIdr } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { BookCallButton } from "@/components/Cta";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { process } = getDictionary(locale);
  return pageMetadata(locale, "/how-we-work", { title: process.metaTitle, description: process.metaDescription });
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 leading-relaxed text-ink-700">
          <Check size={20} aria-hidden="true" className="mt-1 shrink-0 text-gold-600" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function HowWeWorkPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { process } = dict;
  const tags = [
    process.tags.free,
    fill(process.tags.from, { price: formatIdr(AUDIT_TIERS[0].priceIdr, locale) }),
    process.tags.quote,
    process.tags.monthly,
  ];
  const AUDIT_STEP = 1;

  return (
    <>
      <PageHeader eyebrow={dict.nav.process} title={process.title} intro={process.intro}>
        <BookCallButton dict={dict} />
      </PageHeader>

      <section className="section">
        <ol className="container-page relative space-y-6">
          {/* The spine that links the four steps on wide screens. */}
          <div aria-hidden="true" className="absolute bottom-10 left-[calc(2rem+1.4rem)] top-10 hidden w-px bg-gradient-to-b from-gold-400 via-azure-400/60 to-transparent lg:block" />
          {process.steps.map((step, index) => (
            <Reveal as="li" key={step.title} className="relative lg:pl-24">
              <span className="step-number mb-4 lg:absolute lg:left-[1.3rem] lg:top-8 lg:mb-0">{index + 1}</span>
              <div className="card glow-card grid gap-7 sm:p-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
                <div>
                  <span className="tag">{tags[index]}</span>
                  <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{step.title}</h2>
                  <p className="mt-3 text-lg leading-relaxed text-ink-600">{step.body}</p>
                </div>
                {index === AUDIT_STEP ? (
                  <div className="space-y-7">
                    {(
                      [
                        [process.audit.lookTitle, process.audit.look],
                        [process.audit.receiveTitle, process.audit.receive],
                        [process.audit.needTitle, process.audit.need],
                      ] as const
                    ).map(([title, items]) => (
                      <div key={title}>
                        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-gold-700">{title}</h3>
                        <CheckList items={items} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="lg:pt-2">
                    <CheckList items={step.bullets} />
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
