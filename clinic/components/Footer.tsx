import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site, waLink } from "@/lib/config";
import { Logo } from "./Logo";
import { PulseLine } from "./PulseLine";

export async function Footer() {
  const t = await getTranslations("Footer");
  const n = await getTranslations("Nav");
  const l = await getTranslations("Legal");
  const c = await getTranslations("Common");
  const cols = [
    { title: t("menu"), links: [["/iv-drips", n("ivDrips")], ["/peptides", n("peptides")], ["/supplements", n("supplements")], ["/memberships", n("memberships")]] },
    { title: t("care"), links: [["/how-it-works", n("howItWorks")], ["/delivery", n("delivery")], ["/blog", n("blog")], ["/faq", n("faq")], ["/contact", n("contact")]] },
    { title: t("legal"), links: [["/legal/terms", l("terms")], ["/legal/privacy", l("privacy")], ["/legal/medical", l("medical")], ["/legal/refunds", l("refunds")]] },
  ] as const;
  const wa = waLink(c("whatsappGeneral", { brand: site.name }));
  return (
    <footer className="mt-24 bg-deep-950 text-mist-100">
      <PulseLine className="block h-12 w-full text-lime-400/70" />
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo className="text-white" onDark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-mist-200/80">{t("about")}</p>
          <ul className="mt-5 space-y-1.5 text-sm text-mist-200/90">
            {wa && <li><a className="underline-offset-4 hover:underline" href={wa} target="_blank" rel="noopener noreferrer">{c("chatOnWhatsapp")}</a></li>}
            <li><a className="underline-offset-4 hover:underline" href={`mailto:${site.email}`}>{site.email}</a></li>
            {site.instagram && <li><a className="underline-offset-4 hover:underline" href={`https://instagram.com/${site.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">Instagram</a></li>}
            {site.address && <li>{site.address}</li>}
          </ul>
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map(([href, label]) => (
                <li key={href}><Link href={href} className="text-mist-100/90 underline-offset-4 hover:underline">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page space-y-3 py-8 text-xs leading-relaxed text-mist-200/70">
          <p>{t("disclaimer")} {t("photos")}</p>
          {site.dispenser && (
            <p>{t("dispensedBy", { name: site.dispenser })}{site.dispenserLicence ? ` ${t("licence", { number: site.dispenserLicence })}` : ""}</p>
          )}
          <p>{t("rights", { year: new Date().getFullYear(), company: site.company || site.name })}{site.companyReg ? ` · ${site.companyReg}` : ""}</p>
        </div>
      </div>
    </footer>
  );
}
