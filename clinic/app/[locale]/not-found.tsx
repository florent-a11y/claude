import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <div className="container-page py-24 text-center">
      <h1 className="h-display text-5xl">{t("title")}</h1>
      <p className="lead mx-auto mt-4 max-w-md">{t("text")}</p>
      <Link href="/" className="btn-primary mt-8">{t("cta")}</Link>
    </div>
  );
}
