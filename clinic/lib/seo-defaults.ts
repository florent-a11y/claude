import en from "../messages/en.json";
import ru from "../messages/ru.json";
import fr from "../messages/fr.json";
import { PRODUCTS, getProduct } from "./catalog";
import { DESCRIPTION_RANGE, SEO_PAGES, TITLE_RANGE, type PageText, type SeoLocale, type SeoPath } from "./seo-settings";

/**
 * The built-in search title and description of every editable page, in the three languages. The wording lives in
 * messages/<language>.json under "Seo": it is written for search results (the right length, the words people type),
 * separately from the headings shown on the pages themselves. The console's "SEO & AI" module can replace any of it.
 */
type Messages = typeof en;
const MESSAGES: Record<SeoLocale, Messages> = { en, ru: ru as unknown as Messages, fr: fr as unknown as Messages };
const KEY: Record<SeoPath, keyof Messages["Seo"]["pages"]> = {
  "/": "home", "/iv-drips": "ivDrips", "/peptides": "peptides", "/supplements": "supplements", "/memberships": "memberships",
  "/how-it-works": "howItWorks", "/delivery": "delivery", "/blog": "blog", "/faq": "faq", "/contact": "contact",
};
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);

export interface SeoValues { brand: string; opens: string; closes: string }

/** Null for a path that is not an editable page. */
export function builtInText(locale: SeoLocale, path: string, values: SeoValues): PageText | null {
  const m = MESSAGES[locale] ?? MESSAGES.en;
  if (path.startsWith("/treatments/")) {
    const product = getProduct(path.slice("/treatments/".length));
    const item = product && (m.Catalog.items as Record<string, { name: string; tagline: string }>)[product.slug];
    if (!product || !item) return null;
    const words = m.Seo.product[product.kind];
    // A long product name would push the title past what a search result shows: fall back to name and brand.
    const full = fill(words.title, { name: item.name, brand: values.brand });
    const long = `${item.tagline} ${words.more}`;
    return {
      title: full.length <= TITLE_RANGE[1] ? full : `${item.name} | ${values.brand}`,
      description: long.length <= DESCRIPTION_RANGE[1] ? long : `${item.tagline} ${words.moreShort}`,
    };
  }
  const key = KEY[path as SeoPath];
  if (!key) return null;
  return { title: fill(m.Seo.pages[key].title, { ...values }), description: fill(m.Seo.pages[key].description, { ...values }) };
}

/** Every page whose title and description can be edited: the main pages, then each product page. */
export function editablePages(): Array<{ group: string; pages: Array<{ path: string; label: string }> }> {
  const names = en.Catalog.items as Record<string, { name: string }>;
  return [
    { group: "Main pages", pages: SEO_PAGES.map((p) => ({ path: p.path, label: p.label })) },
    { group: "Products", pages: PRODUCTS.map((p) => ({ path: `/treatments/${p.slug}`, label: names[p.slug]?.name ?? p.slug })) },
  ];
}
