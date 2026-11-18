"use client";
import { useMemo, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { saveSeoPagesAction } from "@/app/admin/seo/actions";
import { DESCRIPTION_RANGE, TITLE_RANGE, lengthStatus, type LengthStatus, type PageText, type SeoLocale, type SeoSettings } from "@/lib/seo-settings";

interface Props {
  groups: Array<{ group: string; pages: Array<{ path: string; label: string }> }>;
  /** The built-in wording of every page in every language. */
  defaults: Record<string, Record<SeoLocale, PageText>>;
  saved: SeoSettings["pages"];
  host: string;
}

const LANGUAGES: Array<[SeoLocale, string]> = [["en", "English"], ["ru", "Русский"], ["fr", "Français"]];
const TONE: Record<LengthStatus, string> = { empty: "text-coral-600", short: "text-amber-700", long: "text-amber-700", good: "text-deep-700" };
const WORD: Record<LengthStatus, string> = { empty: "empty", short: "a little short", long: "too long, it will be cut", good: "good length" };

/** Titles and descriptions: pick a page and a language, write, and see the search result as it would appear. */
export function SeoEditor({ groups, defaults, saved, host }: Props) {
  const [overrides, setOverrides] = useState<SeoSettings["pages"]>(saved);
  const [path, setPath] = useState(groups[0]?.pages[0]?.path ?? "/");
  const [locale, setLocale] = useState<SeoLocale>("en");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const builtIn = defaults[path]?.[locale] ?? { title: "", description: "" };
  const mine = overrides[path]?.[locale] ?? {};
  const title = mine.title ?? "";
  const description = mine.description ?? "";
  const shown = { title: title.trim() || builtIn.title, description: description.trim() || builtIn.description };
  const titleStatus = lengthStatus(shown.title, TITLE_RANGE);
  const descriptionStatus = lengthStatus(shown.description, DESCRIPTION_RANGE);

  /** Per page: whether every language has a title and description of a good length, and whether you edited it. */
  const state = useMemo(() => {
    const out: Record<string, { good: boolean; edited: boolean }> = {};
    for (const g of groups) for (const p of g.pages) {
      let good = true;
      let edited = false;
      for (const [l] of LANGUAGES) {
        const d = defaults[p.path]?.[l];
        const o = overrides[p.path]?.[l];
        if (o?.title?.trim() || o?.description?.trim()) edited = true;
        if (lengthStatus(o?.title?.trim() || d?.title || "", TITLE_RANGE) !== "good" || lengthStatus(o?.description?.trim() || d?.description || "", DESCRIPTION_RANGE) !== "good") good = false;
      }
      out[p.path] = { good, edited };
    }
    return out;
  }, [groups, defaults, overrides]);

  function set(field: keyof PageText, value: string) {
    setOverrides((prev) => ({ ...prev, [path]: { ...prev[path], [locale]: { ...prev[path]?.[locale], [field]: value } } }));
    setDirty(true);
    setNotice(null);
  }
  function reset() {
    setOverrides((prev) => {
      const page = { ...prev[path] };
      delete page[locale];
      return { ...prev, [path]: page };
    });
    setDirty(true);
    setNotice(null);
  }
  function save() {
    startTransition(async () => {
      const res = await saveSeoPagesAction(overrides);
      setNotice(res.ok ? { ok: true, text: "Saved. The site shows the new wording now." } : { ok: false, text: res.error ?? "Could not save." });
      if (res.ok) setDirty(false);
    });
  }

  const address = `${host}${locale === "en" ? "" : `/${locale}`}${path === "/" ? "" : path}`;
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      <nav aria-label="Pages" className="max-h-[34rem] overflow-y-auto rounded-2xl border border-mist-200 bg-white p-2">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-ink-500">{g.group}</p>
            <ul>
              {g.pages.map((p) => (
                <li key={p.path}>
                  <button type="button" onClick={() => setPath(p.path)} aria-current={p.path === path ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${p.path === path ? "bg-deep-900 font-semibold text-white" : "text-ink-900 hover:bg-mist-100"}`}>
                    <span className="truncate">{p.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {state[p.path]?.edited && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.path === path ? "bg-white/20" : "bg-tide-100 text-deep-700"}`}>edited</span>}
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${state[p.path]?.good ? "bg-tide-500" : "bg-amber-500"}`} />
                      <span className="sr-only">{state[p.path]?.good ? "good lengths" : "needs attention"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Language" className="inline-flex rounded-full border border-mist-200 bg-mist-50 p-1">
            {LANGUAGES.map(([code, name]) => (
              <button key={code} type="button" role="tab" aria-selected={locale === code} onClick={() => setLocale(code)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${locale === code ? "bg-white text-deep-900 shadow-sm" : "text-ink-500 hover:text-deep-900"}`}>{name}</button>
            ))}
          </div>
          <button type="button" onClick={reset} disabled={!title && !description} className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink-500/50 disabled:no-underline">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Use the built-in wording
          </button>
        </div>

        <div className="mt-5">
          <label className="label" htmlFor="seo-title">Title</label>
          <input id="seo-title" className="input" value={title} maxLength={120} placeholder={builtIn.title} onChange={(e) => set("title", e.target.value)} />
          <p className={`hint ${TONE[titleStatus]}`}>{shown.title.length} characters: {WORD[titleStatus]}. Aim for {TITLE_RANGE[0]} to {TITLE_RANGE[1]}.{!title && " Showing the built-in title."}</p>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="seo-description">Description</label>
          <textarea id="seo-description" className="input" rows={3} value={description} maxLength={320} placeholder={builtIn.description} onChange={(e) => set("description", e.target.value)} />
          <p className={`hint ${TONE[descriptionStatus]}`}>{shown.description.length} characters: {WORD[descriptionStatus]}. Aim for {DESCRIPTION_RANGE[0]} to {DESCRIPTION_RANGE[1]}.{!description && " Showing the built-in description."}</p>
        </div>

        <p className="mt-6 text-xs font-bold uppercase tracking-wider text-ink-500">How it appears in a search result</p>
        <div className="mt-2 rounded-xl border border-mist-200 bg-mist-50 p-4">
          <p className="truncate text-xs text-ink-500">{address}</p>
          <p className="mt-1 line-clamp-1 text-lg font-medium text-[#1a0dab]">{shown.title}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-700">{shown.description}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary btn-sm">{pending ? "Saving…" : "Save titles and descriptions"}</button>
          {dirty && !notice && <p className="text-sm text-amber-700">You have changes that are not saved.</p>}
          {notice && <p role="status" className={`text-sm font-medium ${notice.ok ? "text-deep-700" : "text-red-700"}`}>{notice.text}</p>}
        </div>
      </div>
    </div>
  );
}
