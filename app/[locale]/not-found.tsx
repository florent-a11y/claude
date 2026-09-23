import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-ink-700">{t("text")}</p>
      <Link href="/" className="btn-secondary mt-8">{t("cta")}</Link>
    </div>
  );
}
