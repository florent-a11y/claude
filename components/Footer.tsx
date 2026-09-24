import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site } from "@/lib/config";
import { CookieSettingsLink } from "@/components/ConsentBanner";

export async function Footer() {
  const t = await getTranslations("Footer");
  const td = await getTranslations("Disclosure");
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-500">
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{td("full")}</p>
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="font-semibold text-ink-900">{site.company}</p>
            <p className="mt-1 text-xs">{site.address}</p>
            <p className="text-xs">{site.companyReg}</p>
            <p className="mt-2"><a className="underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></p>
          </div>
          <div>
            <p className="font-semibold text-ink-900">{t("service")}</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/apply">{t("arrivalCard")}</Link></li>
              <li><Link href="/reminder">{t("reminder")}</Link></li>
              <li><Link href="/evoa">{t("evoa")}</Link></li>
              <li><Link href="/pricing">{t("pricing")}</Link></li>
              <li><Link href="/faq">{t("faq")}</Link></li>
              <li><Link href="/contact">{t("contact")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink-900">{t("resources")}</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/guide">{t("guide")}</Link></li>
              <li><Link href="/customs">{t("customs")}</Link></li>
              <li><Link href="/news">{t("news")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink-900">{t("legal")}</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/legal/disclosure">{t("disclosure")}</Link></li>
              <li><Link href="/legal/terms">{t("terms")}</Link></li>
              <li><Link href="/legal/privacy">{t("privacy")}</Link></li>
              <li><Link href="/legal/refunds">{t("refunds")}</Link></li>
              <li><CookieSettingsLink label={t("cookieSettings")} /></li>
            </ul>
          </div>
        </div>
        <p className="mt-8">{t("rights", { year: new Date().getFullYear(), company: site.company })}</p>
      </div>
    </footer>
  );
}
