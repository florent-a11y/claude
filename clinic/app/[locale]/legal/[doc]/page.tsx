import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/i18n/seo";
import { LEGAL_DOCS, legalDoc, type LegalKey } from "@/lib/legal";

type Props = { params: Promise<{ locale: string; doc: string }> };
const isDoc = (d: string): d is LegalKey => (LEGAL_DOCS as readonly string[]).includes(d);

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => LEGAL_DOCS.map((doc) => ({ locale, doc })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isDoc(doc)) return {};
  const t = await getTranslations({ locale, namespace: "Legal" });
  return pageMetadata(locale, `/legal/${doc}`, { title: t(doc) });
}

export default async function LegalPage({ params }: Props) {
  const { locale, doc } = await params;
  if (!isDoc(doc)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const content = legalDoc(doc);
  return (
    <article className="container-page max-w-3xl py-14">
      <h1 className="h-display text-5xl">{t(doc)}</h1>
      <p className="mt-3 text-sm text-ink-500">{t("updated", { date: content.updated })}</p>
      {locale !== "en" && <p className="mt-6 rounded-2xl bg-tide-100 px-5 py-4 text-sm text-ink-700">{t("englishOnly")}</p>}
      <div className="prose-legal mt-4" lang="en">
        {content.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.ul && <ul>{s.ul.map((li) => <li key={li}>{li}</li>)}</ul>}
            {s.p?.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </div>
    </article>
  );
}
