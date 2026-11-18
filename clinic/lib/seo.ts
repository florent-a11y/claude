import "server-only";
import type { Metadata } from "next";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { AREAS, demoMode, site } from "./config";
import { builtInText } from "./seo-defaults";
import { DEFAULT_SEO, effectiveText, normalizeSeo, type PageText, type SeoLocale, type SeoSettings } from "./seo-settings";
import { getSetting, saveSetting } from "./store";
import { pageMetadata } from "@/i18n/seo";

/**
 * The stored "SEO & AI" settings, kept in the server cache and refreshed when they are saved in the console.
 * Reading them must never break a page: if storage cannot be reached, the site falls back to its built-in wording.
 */
const cached = unstable_cache(async () => normalizeSeo(await getSetting("seo")), ["clinic-seo-settings"], { tags: ["seo"], revalidate: 300 });
export async function seoSettings(): Promise<SeoSettings> {
  try { return await cached(); } catch (e) { console.error("[seo] settings unavailable, using defaults", e); return DEFAULT_SEO; }
}

export async function saveSeoSettings(next: SeoSettings, by: string): Promise<void> {
  await saveSetting("seo", { ...normalizeSeo(next), updatedAt: new Date().toISOString(), updatedBy: by });
  revalidateTag("seo");
  revalidatePath("/", "layout"); // every page carries a title, a description or the verification tags
  revalidatePath("/robots.txt");
  revalidatePath("/llms.txt");
}

/** The settings as stored right now, without the cache: what the console shows and edits. */
export async function freshSeoSettings(): Promise<SeoSettings> {
  return normalizeSeo(await getSetting("seo"));
}

/** The built-in title and description of an editable page, in the visitor's language. Null for any other path. */
export function pageDefaults(locale: string, path: string): PageText | null {
  return builtInText(locale as SeoLocale, path, { brand: site.name, opens: site.opens, closes: site.closes });
}

/** Title, description, language links and social tags of an editable page, with the console's wording applied. */
export async function pageSeo(locale: string, path: string): Promise<Metadata> {
  const defaults = pageDefaults(locale, path);
  if (!defaults) return {};
  const text = effectiveText(await seoSettings(), path, locale as SeoLocale, defaults);
  return pageMetadata(locale, path, { title: text.title, description: text.description, absolute: true });
}

/** The statements about the business published in /llms.txt when you have not written your own. */
export function defaultLlmsFacts(): string[] {
  return [
    `It operates in Bali, Indonesia only, in these areas: ${AREAS.join(", ")}.`,
    `It is open every day from ${site.opens} to ${site.closes}, Bali time (UTC+8).`,
    "Prescription items, including every peptide, are supplied only after a licensed doctor has reviewed the customer's health questionnaire. Payment is taken after approval.",
    "IV drips and injections are given by a nurse, at the lounge or at the customer's villa or hotel.",
    "Several peptides it lists (for example BPC-157, TB-500, Epitalon) are not approved medicines; the site says so on each product page.",
    "It serves adults aged 18 and over and is not an emergency service.",
    "Prices are in Indonesian rupiah (IDR).",
  ];
}

/**
 * IndexNow: tells Bing and Yandex (and the assistants built on them) that pages are new or changed.
 * Does nothing on a test site, without a key, or off a real https domain. Never throws.
 */
export async function pingIndexNow(paths: string[]): Promise<"sent" | "skipped" | "failed"> {
  try {
    const { indexNowKey } = await seoSettings();
    const url = new URL(site.url);
    if (demoMode() || !indexNowKey || url.protocol !== "https:" || paths.length === 0) return "skipped";
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: url.host, key: indexNowKey, keyLocation: `${site.url}/${indexNowKey}.txt`, urlList: [...new Set(paths)].slice(0, 100).map((p) => `${site.url}${p}`) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error("[indexnow]", res.status); return "failed"; }
    return "sent";
  } catch (e) {
    console.error("[indexnow]", e);
    return "failed";
  }
}

export { editablePages } from "./seo-defaults";
