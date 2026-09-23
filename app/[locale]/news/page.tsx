import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { intlLocale } from "@/i18n/routing";
import { listNews } from "@/lib/store";
import { site } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "News" });
  return pageMetadata(locale, "/news", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function News({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("News");
  const tc = await getTranslations("Common");
  let items: Awaited<ReturnType<typeof listNews>> = [];
  try { items = await listNews(40); } catch { items = []; }
  const evergreen = [
    { title: t("evergreen.arrivalCard.title"), text: t("evergreen.arrivalCard.text"), url: site.officialPortal },
    { title: t("evergreen.cash.title"), text: t("evergreen.cash.text"), url: "https://www.beacukai.go.id/" },
  ];
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { year: "numeric", month: "2-digit", day: "2-digit" });
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-ink-700">{t("intro")}</p>

      <h2 className="mt-10 text-xl font-bold">{t("keyRules")}</h2>
      <ul className="mt-4 space-y-4">
        {evergreen.map((e) => (
          <li key={e.title} className="card"><h3 className="font-semibold">{e.title}</h3><p className="mt-1 text-sm text-ink-700">{e.text}</p><a className="mt-2 inline-block text-sm text-brand-600 underline" href={e.url} target="_blank" rel="noopener nofollow">{tc("officialSource")}</a></li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold">{t("latest")}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-ink-500">{t("empty")}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((n) => (
            <li key={n.id} className="card">
              <p className="text-xs font-semibold uppercase text-brand-600">{t(`sources.${n.source}`)} · {fmt.format(new Date(n.publishedAt))}</p>
              <h3 className="mt-1 font-semibold">{n.title}</h3>
              {n.summary && <p className="mt-1 text-sm text-ink-700">{n.summary}</p>}
              <a className="mt-2 inline-block text-sm text-brand-600 underline" href={n.url} target="_blank" rel="noopener nofollow">{tc("readOriginal")}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
