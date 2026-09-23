import { getTranslations } from "next-intl/server";

export async function DisclosureBar() {
  const t = await getTranslations("Disclosure");
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-center text-xs text-amber-900 sm:text-sm">
      <p className="mx-auto max-w-6xl px-4 py-2">
        {t.rich("bar", { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
    </div>
  );
}
