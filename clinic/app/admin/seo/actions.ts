"use server";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { staff } from "@/lib/admin";
import { allPublishedPosts } from "@/lib/posts";
import { defaultLlmsFacts, editablePages, freshSeoSettings, pageDefaults, pingIndexNow, saveSeoSettings } from "@/lib/seo";
import { AI_CRAWLERS, normalizeSeo, verificationCode, type SeoSettings } from "@/lib/seo-settings";
import { LOCALES, localizedPath } from "@/i18n/routing";
import { PUBLIC_PATHS } from "@/i18n/seo";

const by = (who: { role: string; user: string }) => `${who.role}:${who.user}`;

/** Saves the titles and descriptions written in the editor. Text identical to the built-in wording is not stored. */
export async function saveSeoPagesAction(pages: SeoSettings["pages"]): Promise<{ ok: boolean; error?: string }> {
  const who = await staff();
  try {
    const clean = normalizeSeo({ pages }).pages;
    const editable = new Set(editablePages().flatMap((g) => g.pages.map((p) => p.path)));
    const next: SeoSettings["pages"] = {};
    for (const [path, byLocale] of Object.entries(clean)) {
      if (!editable.has(path)) continue;
      for (const locale of LOCALES) {
        const mine = byLocale[locale];
        const builtIn = pageDefaults(locale, path);
        if (!mine || !builtIn) continue;
        const title = mine.title && mine.title !== builtIn.title ? mine.title : "";
        const description = mine.description && mine.description !== builtIn.description ? mine.description : "";
        if (title || description) (next[path] ??= {})[locale] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
      }
    }
    await saveSeoSettings({ ...(await freshSeoSettings()), pages: next }, by(who));
    return { ok: true };
  } catch (e) {
    console.error("[seo] save pages", e);
    return { ok: false, error: "Could not save. Please try again." };
  }
}

/** AI access: ticked crawlers are allowed, the others are refused in robots.txt. */
export async function saveCrawlersAction(form: FormData) {
  const who = await staff();
  const allowed = new Set(form.getAll("allow").map(String));
  await saveSeoSettings({ ...(await freshSeoSettings()), blockedCrawlers: AI_CRAWLERS.map((c) => c.agent).filter((a) => !allowed.has(a)) }, by(who));
  redirect("/admin/seo?done=ai#ai");
}

/** The facts published in /llms.txt, one per line. The built-in list, left untouched, is not stored (it follows the site's settings). */
export async function saveFactsAction(form: FormData) {
  const who = await staff();
  const lines = String(form.get("facts") ?? "").split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  const reset = form.get("intent") === "reset" || JSON.stringify(lines) === JSON.stringify(defaultLlmsFacts());
  await saveSeoSettings({ ...(await freshSeoSettings()), llmsFacts: reset ? [] : lines }, by(who));
  redirect("/admin/seo?done=facts#facts");
}

export async function saveVerificationAction(form: FormData) {
  const who = await staff();
  const code = (name: string) => verificationCode(String(form.get(name) ?? ""));
  await saveSeoSettings({ ...(await freshSeoSettings()), verification: { google: code("google"), bing: code("bing"), yandex: code("yandex") } }, by(who));
  redirect("/admin/seo?done=search#search");
}

/** IndexNow: create or remove the key, or announce every public page now. */
export async function indexNowAction(form: FormData) {
  const who = await staff();
  const intent = String(form.get("intent") ?? "");
  const current = await freshSeoSettings();
  if (intent === "create" && !current.indexNowKey) {
    await saveSeoSettings({ ...current, indexNowKey: randomBytes(16).toString("hex") }, by(who));
    redirect("/admin/seo?done=key#search");
  }
  if (intent === "remove") {
    await saveSeoSettings({ ...current, indexNowKey: "" }, by(who));
    redirect("/admin/seo?done=key-removed#search");
  }
  if (intent === "ping") {
    const posts = await allPublishedPosts();
    const paths = [
      ...LOCALES.flatMap((l) => [...PUBLIC_PATHS, "/blog"].map((p) => localizedPath(l, p))),
      ...posts.map((p) => localizedPath(p.locale, `/blog/${p.slug}`)),
    ];
    redirect(`/admin/seo?done=ping-${await pingIndexNow(paths)}#search`);
  }
  redirect("/admin/seo#search");
}
