"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bold, Check, Heading2, Heading3, ImageIcon, Italic, Link2, List, ListOrdered, Quote, Table, X } from "lucide-react";
import { savePostAction } from "@/app/admin/actions";
import { formatFaq, formatSources, parseFaq, parseLines, parseSources, readingMinutes, slugify, writingChecks, type Post } from "@/lib/blog";
import { PHOTOS, type PhotoKey } from "@/lib/photos";
import { Markdown } from "./Markdown";
import { Photo } from "./Photo";

interface Props {
  post: Post | null;
  /** The other articles, to link this one as a translation of one of them. */
  others: Array<{ id: string; title: string; locale: string; translationKey: string }>;
  products: Array<{ slug: string; name: string }>;
  photos: string[];
  defaultAuthor: string;
}

const LANGUAGES = [["en", "English"], ["ru", "Русский"], ["fr", "Français"]] as const;

/** The writing editor: fields on the left; live preview and a search-and-AI checklist on the right. */
export function PostEditor({ post, others, products, photos, defaultAuthor }: Props) {
  const router = useRouter();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"preview" | "checklist">("checklist");

  const [locale, setLocale] = useState<Post["locale"]>(post?.locale ?? "en");
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [takeaways, setTakeaways] = useState((post?.takeaways ?? []).join("\n"));
  const [body, setBody] = useState(post?.body ?? "");
  const [cover, setCover] = useState(post?.cover ?? "");
  const [tags, setTags] = useState((post?.tags ?? []).join(", "));
  const [author, setAuthor] = useState(post?.author ?? defaultAuthor);
  const [reviewer, setReviewer] = useState(post?.reviewer ?? "");
  const [sources, setSources] = useState(formatSources(post?.sources ?? []));
  const [faq, setFaq] = useState(formatFaq(post?.faq ?? []));
  const [related, setRelated] = useState<string[]>(post?.related ?? []);
  const [translationKey, setTranslationKey] = useState(post?.translationKey ?? "");
  const [publishedAt, setPublishedAt] = useState(post?.publishedAt ? post.publishedAt.slice(0, 16) : "");

  const shownSlug = slugTouched ? slug : slugify(title);
  const checks = useMemo(
    () => writingChecks({ title, excerpt, takeaways: parseLines(takeaways, 8), body, cover, sources: parseSources(sources), faq: parseFaq(faq), reviewer }),
    [title, excerpt, takeaways, body, cover, sources, faq, reviewer],
  );
  const done = checks.filter((c) => c.ok).length;
  const linkable = others.filter((o) => o.locale !== locale);
  const linked = others.filter((o) => translationKey && o.translationKey === translationKey && o.locale !== locale);

  /** Wraps the selection (bold, italic, link) or starts the selected lines with a marker (headings, lists, quotes). */
  function edit(kind: "wrap" | "line" | "insert", a: string, b = "") {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    let next = value;
    let from = s;
    let to = e;
    if (kind === "wrap") {
      const sel = value.slice(s, e) || "text";
      next = value.slice(0, s) + a + sel + b + value.slice(e);
      from = s + a.length; to = from + sel.length;
    } else if (kind === "line") {
      const start = value.lastIndexOf("\n", s - 1) + 1;
      const block = value.slice(start, e) || "";
      const marked = block.split("\n").map((l, i) => (a === "1. " ? `${i + 1}. ${l}` : a + l)).join("\n");
      next = value.slice(0, start) + marked + value.slice(e);
      from = start; to = start + marked.length;
    } else {
      const gap = s > 0 && value[s - 1] !== "\n" ? "\n\n" : "";
      next = value.slice(0, s) + gap + a + value.slice(e);
      from = to = s + gap.length + a.length;
    }
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, to); });
  }

  function save(status: Post["status"]) {
    setNotice(null);
    startTransition(async () => {
      const result = await savePostAction({
        id: post?.id, locale, slug: shownSlug, translationKey, title, excerpt, takeaways, body, cover, tags, author, reviewer, sources, faq, related, status,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      });
      if (!result.ok) { setNotice({ ok: false, text: result.error ?? "The article could not be saved." }); return; }
      setNotice({ ok: true, text: status === "published" ? "Saved and published." : "Draft saved." });
      if (!post && result.id) router.replace(`/admin/blog/${result.id}`);
      else router.refresh();
    });
  }

  const tools: Array<{ icon: typeof Bold; label: string; run: () => void }> = [
    { icon: Heading2, label: "Section heading", run: () => edit("line", "## ") },
    { icon: Heading3, label: "Sub-heading", run: () => edit("line", "### ") },
    { icon: Bold, label: "Bold", run: () => edit("wrap", "**", "**") },
    { icon: Italic, label: "Italic", run: () => edit("wrap", "*", "*") },
    { icon: Link2, label: "Link", run: () => edit("wrap", "[", "](https://)") },
    { icon: List, label: "Bulleted list", run: () => edit("line", "- ") },
    { icon: ListOrdered, label: "Numbered list", run: () => edit("line", "1. ") },
    { icon: Quote, label: "Quote", run: () => edit("line", "> ") },
    { icon: Table, label: "Table", run: () => edit("insert", "| Column A | Column B |\n|---|---|\n| … | … |\n| … | … |\n") },
    { icon: ImageIcon, label: "Photo from the library", run: () => edit("insert", `![Describe the photo](photo:${cover || photos[0]})\n`) },
  ];
  const field = "input py-2.5 text-[15px]";
  const count = (n: number, min: number, max: number) => <span className={`ml-2 text-xs font-medium ${n >= min && n <= max ? "text-tide-600" : "text-ink-500"}`}>{n} characters</span>;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {/* ---------- Writing ---------- */}
      <div className="space-y-5 rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="label" htmlFor="pe-locale">Language</label>
            <select id="pe-locale" className={field} value={locale} onChange={(e) => setLocale(e.target.value as Post["locale"])}>
              {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pe-title">Title{count(title.length, 20, 65)}</label>
            <input id="pe-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Say what the reader will learn, in their words" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pe-slug">Address</label>
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <span className="whitespace-nowrap">/blog/</span>
            <input id="pe-slug" className={field} value={shownSlug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} maxLength={90} aria-describedby="pe-slug-hint" />
          </div>
          <p id="pe-slug-hint" className="hint">Filled in from the title. Keep it short; do not change it after the article is published, or old links will break.</p>
        </div>
        <div>
          <label className="label" htmlFor="pe-excerpt">Summary for search results{count(excerpt.length, 110, 165)}</label>
          <textarea id="pe-excerpt" className={`${field} min-h-20`} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} maxLength={320} placeholder="One or two sentences that answer the question in the title." />
        </div>
        <div>
          <label className="label" htmlFor="pe-takeaways">Key takeaways</label>
          <textarea id="pe-takeaways" className={`${field} min-h-28`} value={takeaways} onChange={(e) => setTakeaways(e.target.value)} aria-describedby="pe-takeaways-hint" placeholder={"One complete sentence per line.\nEach should make sense on its own."} />
          <p id="pe-takeaways-hint" className="hint">Shown in a box at the top. Search engines and AI assistants quote these lines, so make each one a clear, true statement.</p>
        </div>

        <div>
          <label className="label" htmlFor="pe-body">Article</label>
          <div className="flex flex-wrap gap-1 rounded-t-xl border border-b-0 border-mist-300 bg-mist-50 p-1.5" role="toolbar" aria-label="Formatting">
            {tools.map(({ icon: Icon, label, run }) => (
              <button key={label} type="button" title={label} aria-label={label} onClick={run} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-deep-900 transition hover:bg-white hover:shadow-sm active:scale-95">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
          <textarea id="pe-body" ref={bodyRef} className="input min-h-[28rem] rounded-t-none font-mono text-sm leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} spellCheck
            placeholder={"Open with the answer, then explain.\n\n## A heading phrased as the reader's question?\n\nShort paragraphs. One idea each."} />
          <p className="hint">Use the buttons above for headings, lists and links. Start sections with a question your reader would type into a search box.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pe-sources">Sources</label>
            <textarea id="pe-sources" className={`${field} min-h-28`} value={sources} onChange={(e) => setSources(e.target.value)} placeholder={"Name of the study or page | https://…\nOne per line"} />
            <p className="hint">Only sources you have read. Articles with named sources are trusted, and cited, far more.</p>
          </div>
          <div>
            <label className="label" htmlFor="pe-faq">Questions and answers</label>
            <textarea id="pe-faq" className={`${field} min-h-28`} value={faq} onChange={(e) => setFaq(e.target.value)} placeholder={"Q: The question as people ask it?\nA: A direct answer in two or three sentences.\n\nQ: …\nA: …"} />
            <p className="hint">Shown under the article and marked up for search engines.</p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pe-cover">Cover photograph</label>
            <select id="pe-cover" className={field} value={cover} onChange={(e) => setCover(e.target.value)}>
              <option value="">Choose a photograph</option>
              {photos.map((k) => <option key={k} value={k}>{k.replace(/-/g, " ")}</option>)}
            </select>
            {cover in PHOTOS && <Photo name={cover as PhotoKey} sizes="320px" className="mt-3 aspect-[16/9] rounded-xl" />}
          </div>
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="pe-tags">Topics</label>
              <input id="pe-tags" className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Peptides, Recovery" />
              <p className="hint">Two or three, separated by commas.</p>
            </div>
            <div>
              <label className="label" htmlFor="pe-author">Author</label>
              <input id="pe-author" className={field} value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="pe-reviewer">Reviewed by (doctor)</label>
              <input id="pe-reviewer" className={field} value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={160} placeholder="Dr Full Name, credentials" />
              <p className="hint">Only the name of a doctor who has really read and approved this version. Leave empty otherwise.</p>
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="label">Related treatments (up to six, shown under the article)</legend>
          <div className="grid max-h-44 gap-x-4 gap-y-1.5 overflow-y-auto rounded-xl border border-mist-200 p-3 text-sm sm:grid-cols-2">
            {products.map((p) => (
              <label key={p.slug} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-deep-700" checked={related.includes(p.slug)} disabled={!related.includes(p.slug) && related.length >= 6}
                  onChange={(e) => setRelated((cur) => (e.target.checked ? [...cur, p.slug] : cur.filter((s) => s !== p.slug)))} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pe-translation">Translation of</label>
            <select id="pe-translation" className={field} value={linkable.find((o) => o.translationKey === translationKey)?.translationKey ?? ""} onChange={(e) => setTranslationKey(e.target.value)}>
              <option value="">Not a translation</option>
              {linkable.map((o) => <option key={o.id} value={o.translationKey}>{o.locale.toUpperCase()} · {o.title}</option>)}
            </select>
            <p className="hint">{linked.length ? `Linked with: ${linked.map((o) => `${o.locale.toUpperCase()} "${o.title}"`).join(", ")}.` : "Pick the same article in another language, if there is one."}</p>
          </div>
          <div>
            <label className="label" htmlFor="pe-date">Publication date (optional)</label>
            <input id="pe-date" type="datetime-local" className={field} value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
            <p className="hint">Empty means now. A future date schedules the article.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-mist-200 pt-5">
          <button type="button" className="btn-primary" disabled={pending || title.trim().length < 3} onClick={() => save("published")}>{pending ? "Saving…" : post?.status === "published" ? "Save changes" : "Publish"}</button>
          <button type="button" className="btn-secondary" disabled={pending || title.trim().length < 3} onClick={() => save("draft")}>{post?.status === "published" ? "Unpublish (back to draft)" : "Save as draft"}</button>
          {notice && <p role={notice.ok ? "status" : "alert"} className={`text-sm font-semibold ${notice.ok ? "text-tide-600" : "text-red-700"}`}>{notice.text}</p>}
        </div>
      </div>

      {/* ---------- Checklist and preview ---------- */}
      <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto">
        <div className="mb-3 inline-flex rounded-full border border-mist-200 bg-white p-1 text-sm font-semibold" role="tablist">
          {(["checklist", "preview"] as const).map((x) => (
            <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={`rounded-full px-4 py-1.5 transition ${tab === x ? "bg-deep-900 text-white" : "text-ink-700 hover:text-deep-900"}`}>
              {x === "checklist" ? `Checklist ${done}/${checks.length}` : "Preview"}
            </button>
          ))}
        </div>

        {tab === "checklist" ? (
          <div className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold text-deep-900">Written to be found and quoted</h2>
            <p className="mt-1 text-sm text-ink-500">What helps an article rank in search and be cited by AI assistants. None of it is compulsory.</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex gap-2.5">
                  <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-tide-500 text-white" : "bg-mist-200 text-ink-500"}`}>{c.ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}</span>
                  <span className={c.ok ? "text-deep-900" : "text-ink-700"}>{c.label}<span className="sr-only">{c.ok ? " (done)" : " (to do)"}</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl bg-mist-50 p-4 text-sm leading-relaxed text-ink-700">
              <p className="font-semibold text-deep-900">How to write it</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>Answer the question in the first two sentences, then explain.</li>
                <li>Say what is proven, what is not, and name the source for each claim.</li>
                <li>Use plain numbers and names; avoid "may help support".</li>
                <li>Never promise a result or call an unapproved product a treatment.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-7">
            <p className="text-xs font-medium text-ink-500">{readingMinutes(body)} min read · /blog/{shownSlug || "…"}</p>
            <h2 className="h-display mt-2 text-3xl">{title || "Your title"}</h2>
            {excerpt && <p className="mt-3 text-ink-700">{excerpt}</p>}
            {parseLines(takeaways, 8).length > 0 && (
              <ul className="mt-5 space-y-2 rounded-2xl bg-deep-950 p-5 text-sm text-white/90">
                {parseLines(takeaways, 8).map((k) => <li key={k} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" aria-hidden="true" />{k}</li>)}
              </ul>
            )}
            <div className="mt-6"><Markdown>{body || "*Your article appears here as you write.*"}</Markdown></div>
          </div>
        )}
      </div>
    </div>
  );
}
