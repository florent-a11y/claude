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
        <li key={item} className="flex gap-3 leading-relaxed text-ink-800">
          <Check size={20} aria-hidden="true" className="mt-1 shrink-0 text-sea-600" />
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
        <ol className="container-page space-y-6">
          {process.steps.map((step, index) => (
            <li key={step.title} className="card grid gap-6 sm:p-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
              <div>
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xl font-extrabold text-marigold-300">
                    {index + 1}
                  </span>
                  <span className="tag">{tags[index]}</span>
                </div>
                <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">{step.title}</h2>
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
                      <h3 className="mb-3 text-lg font-bold text-ink-950">{title}</h3>
                      <CheckList items={items} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lg:pt-2">
                  <CheckList items={step.bullets} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
