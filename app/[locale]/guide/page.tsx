import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { pageMetadata } from "@/i18n/seo";
import { JsonLd } from "@/components/JsonLd";
import { OfficialNote } from "@/components/OfficialNote";
import { site } from "@/lib/config";
import { PRICING, money } from "@/lib/pricing";

type Props = { params: Promise<{ locale: string }> };

const APP_STORE = "https://apps.apple.com/us/app/all-indonesia/id6749558272";
const GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=id.go.imigrasi.allindonesia";
const ext = { target: "_blank", rel: "noopener nofollow" } as const;

const TOC = ["before-you-start", "portal", "app", "family", "health-customs", "after", "problems", "mistakes", "faq", "sources"] as const;
const TOC_KEYS: Record<(typeof TOC)[number], string> = { "before-you-start": "before", portal: "portal", app: "app", family: "family", "health-customs": "healthCustoms", after: "after", problems: "problems", mistakes: "mistakes", faq: "faq", sources: "sources" };
const PORTAL_STEPS = ["open", "email", "personal", "travel", "health", "customs", "review", "save"] as const;
const APP_STEPS = ["install", "account", "start", "sections", "submit"] as const;
const NEED = ["passport", "flight", "departure", "accommodation", "email", "countries", "goods", "nik"] as const;
const DEVICE = ["connection", "personalEmail", "oneCard"] as const;
const FAMILY_TIPS = ["order", "sameEmail", "noCopy", "child"] as const;
const CUSTOMS_YES = ["cash", "goods", "commercial", "prohibited"] as const;
const PROBLEMS = ["noEmail", "appCloses", "loginLoop", "scanFails", "tooEarly", "slow", "wrongDate", "twice", "airline", "oneQr"] as const;
const MISTAKES = ["name", "passportNumber", "date", "port", "unofficial", "customs", "oneQr", "screenshot", "email"] as const;
const FAQS = ["visa", "cost", "when", "children", "citizens", "transit", "print", "lost", "onArrival", "airports", "appOrWeb", "airport"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Guide" });
  return pageMetadata(locale, "/guide", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Guide({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Guide");
  const price = money(PRICING.arrivalCard.first, PRICING.currency, intlLocale(locale));
  const portalSteps = PORTAL_STEPS.map((k) => ({ t: t(`portalSteps.${k}.t`), d: t(`portalSteps.${k}.d`) }));
  const faqs = FAQS.map((k) => ({ q: t(`faqs.${k}.q`), a: t(`faqs.${k}.a`) }));
  const portalLink = (chunks: React.ReactNode) => <a href={site.officialPortal} {...ext}>{chunks}</a>;
  const retrieveLink = (chunks: React.ReactNode) => <a href={site.officialRetrieve} {...ext}>{chunks}</a>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: t("howToName"),
          description: t("howToDescription"),
          totalTime: "PT15M",
          inLanguage: locale,
          step: portalSteps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.t, text: s.d })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          inLanguage: locale,
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />

      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{t("kicker")}</p>
      <h1 className="mt-2 text-3xl font-bold md:text-4xl">{t("title")}</h1>

      <div className="prose-basic mt-6">
        <p>{t("intro1")}</p>
        <p>{t("intro2")}</p>
      </div>
      <OfficialNote className="mt-2 text-sm text-ink-500" />
      <p className="mt-2 text-sm text-ink-500">
        {t.rich("officialApps", {
          play: (chunks) => <a className="underline" href={GOOGLE_PLAY} {...ext}>{chunks}</a>,
          store: (chunks) => <a className="underline" href={APP_STORE} {...ext}>{chunks}</a>,
        })}
      </p>

      <nav aria-label={t("tocLabel")} className="card mt-8 bg-slate-50">
        <p className="font-semibold">{t("tocTitle")}</p>
        <ol className="mt-2 grid gap-1 text-sm text-ink-700 sm:grid-cols-2">
          {TOC.map((id, i) => (
            <li key={id}><a className="underline underline-offset-2 hover:text-brand-700" href={`#${id}`}>{i + 1}. {t(`toc.${TOC_KEYS[id]}`)}</a></li>
          ))}
        </ol>
      </nav>

      <div className="prose-basic">
        <h2 id="before-you-start" className="scroll-mt-24">{t("toc.before")}</h2>
        <p>{t("before.intro")}</p>
        <h3>{t("before.needTitle")}</h3>
        <ul>
          {NEED.map((k) => <li key={k}>{t(`before.need.${k}`)}</li>)}
        </ul>
        <h3>{t("before.timingTitle")}</h3>
        <p>{t.rich("before.timing", { link: (chunks) => <Link href="/reminder">{chunks}</Link> })}</p>
        <h3>{t("before.deviceTitle")}</h3>
        <ul>
          {DEVICE.map((k) => <li key={k}>{t(`before.device.${k}`)}</li>)}
        </ul>

        <h2 id="portal" className="scroll-mt-24">{t("toc.portal")}</h2>
        <p>{t.rich("portalIntro", { link: portalLink })}</p>
        <ol>
          {portalSteps.map((s) => (
            <li key={s.t}><strong>{s.t}.</strong> {s.d}</li>
          ))}
        </ol>

        <h2 id="app" className="scroll-mt-24">{t("toc.app")}</h2>
        <p>{t("appIntro")}</p>
        <ol>
          {APP_STEPS.map((k) => (
            <li key={k}><strong>{t(`appSteps.${k}.t`)}.</strong> {t(`appSteps.${k}.d`)}</li>
          ))}
        </ol>
        <h3>{t("appOrWebTitle")}</h3>
        <ul>
          <li>{t("appOrWeb.web")}</li>
          <li>{t("appOrWeb.app")}</li>
        </ul>

        <h2 id="family" className="scroll-mt-24">{t("toc.family")}</h2>
        <p>{t("family1")}</p>
        <p>{t.rich("family2", { link: retrieveLink })}</p>
        <h3>{t("familyTipsTitle")}</h3>
        <ul>
          {FAMILY_TIPS.map((k) => <li key={k}>{t(`familyTips.${k}`)}</li>)}
        </ul>

        <h2 id="health-customs" className="scroll-mt-24">{t("toc.healthCustoms")}</h2>
        <h3>{t("healthTitle")}</h3>
        <p>{t("health")}</p>
        <h3>{t("customsTitle")}</h3>
        <p>{t("customsIntro")}</p>
        <ul>
          {CUSTOMS_YES.map((k) => <li key={k}>{t(`customsYes.${k}`)}</li>)}
        </ul>
        <p>{t.rich("customsBags", { link: (chunks) => <Link href="/customs">{chunks}</Link> })}</p>
        <h3>{t("quarantineTitle")}</h3>
        <p>{t("quarantine")}</p>
        <h3>{t("imeiTitle")}</h3>
        <p>{t("imei")}</p>

        <h2 id="after" className="scroll-mt-24">{t("toc.after")}</h2>
        <h3>{t("after.qrEmailTitle")}</h3>
        <p>{t("after.qrEmail")}</p>
        <h3>{t("after.lostTitle")}</h3>
        <p>{t.rich("after.lost", { link: retrieveLink })}</p>
        <h3>{t("after.airlineTitle")}</h3>
        <p>{t("after.airline")}</p>
        <h3>{t("after.immigrationTitle")}</h3>
        <p>{t("after.immigration")}</p>
        <h3>{t("after.customsTitle")}</h3>
        <p>{t("after.customs")}</p>

        <h2 id="problems" className="scroll-mt-24">{t("toc.problems")}</h2>
        <table>
          <thead><tr><th>{t("problemCol")}</th><th>{t("fixCol")}</th></tr></thead>
          <tbody>
            {PROBLEMS.map((k) => (
              <tr key={k}><td className="font-medium">{t(`problems.${k}.p`)}</td><td>{t(`problems.${k}.f`)}</td></tr>
            ))}
          </tbody>
        </table>

        <h2 id="mistakes" className="scroll-mt-24">{t("toc.mistakes")}</h2>
        <ul>
          {MISTAKES.map((k) => (
            <li key={k}><strong>{t(`mistakes.${k}.m`)}.</strong> {t(`mistakes.${k}.c`)}</li>
          ))}
        </ul>

        <h2 id="faq" className="scroll-mt-24">{t("toc.faq")}</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <p className="mt-2 text-ink-700">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="prose-basic">
        <h2 id="sources" className="scroll-mt-24">{t("toc.sources")}</h2>
        <p>{t("sourcesIntro")}</p>
        <ul>
          <li>{t.rich("sources.portal", { portal: portalLink, help: (chunks) => <a href="https://allindonesia.imigrasi.go.id/help" {...ext}>{chunks}</a>, retrieve: retrieveLink })}</li>
          <li>{t.rich("sources.apps", { play: (chunks) => <a href={GOOGLE_PLAY} {...ext}>{chunks}</a>, store: (chunks) => <a href={APP_STORE} {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.cirebon", { link: (chunks) => <a href="https://cirebon.imigrasi.go.id/component/content/article/all-indonesia-indonesia-arrival-card?catid=19&Itemid=101" {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.karawang", { link: (chunks) => <a href="https://karawang.imigrasi.go.id/begini-tata-cara-registrasi-aplikasi-all-indonesia-untuk-pengajuan-kartu-kedatangan/" {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.woah", { link: (chunks) => <a href="https://rr-asia.woah.org/app/uploads/2025/09/2025-09-All-Indonesia-Arrival-Card-Guide.pdf" {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.wikipedia", { link: (chunks) => <a href="https://en.wikipedia.org/wiki/All_Indonesia_Arrival_Card" {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.autogate", { link: (chunks) => <a href="https://www.indonesia.travel/gb/en/news-update/escape-long-immigration-queue-with-autogate-system-at-these-2-international-airports-in-indonesia" {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.customs", { link: (chunks) => <a href="https://www.beacukai.go.id/" {...ext}>{chunks}</a> })}</li>
          <li>{t.rich("sources.tripadvisor", {
            a: (chunks) => <a href="https://www.tripadvisor.com/ShowTopic-g294226-i7220-k15418615-o90-Indonesia_All_Indonesia_Arrival_Card-Bali.html" {...ext}>{chunks}</a>,
            b: (chunks) => <a href="https://www.tripadvisor.com/ShowTopic-g294226-i7220-k15459210-Wrong_date_on_the_All_Indonesia_arrival_card-Bali.html" {...ext}>{chunks}</a>,
            c: (chunks) => <a href="https://www.tripadvisor.com/ShowTopic-g294226-i7220-k15557283-Only_one_QR_for_a_group_Arrival_card-Bali.html" {...ext}>{chunks}</a>,
          })}</li>
          <li>{t.rich("sources.guides", {
            wego: (chunks) => <a href="https://blog.wego.com/all-indonesia-arrival-card/" {...ext}>{chunks}</a>,
            wbtb: (chunks) => <a href="https://www.welcomebacktobali.com/blog/latest-updates/the-new-all-indonesia-arrival-card" {...ext}>{chunks}</a>,
            bali: (chunks) => <a href="https://bali.com/bali/all-indonesia/" {...ext}>{chunks}</a>,
            emerhub: (chunks) => <a href="https://emerhub.com/indonesia/all-indonesia-arrival-card-a-guide-for-tourists/" {...ext}>{chunks}</a>,
            tsl: (chunks) => <a href="https://thesmartlocal.com/read/all-indonesia-app/" {...ext}>{chunks}</a>,
            zoom: (chunks) => <a href="https://www.zoomtravel-international.com/post/all-indonesia-e-arrival-card-batam-update-2025" {...ext}>{chunks}</a>,
          })}</li>
        </ul>
      </div>

      <div className="card mt-10 bg-slate-50">
        <h2 className="text-xl font-bold">{t("ctaTitle")}</h2>
        <p className="mt-2 text-ink-700">{t("ctaText", { price })}</p>
        <Link href="/apply" className="btn-primary mt-4">{t("cta")}</Link>
        <p className="mt-4 text-sm text-ink-500">
          {t.rich("ctaReminder", { link: (chunks) => <Link className="underline" href="/reminder">{chunks}</Link> })}
        </p>
      </div>
    </div>
  );
}
