import { CircleCheck, CircleX, ExternalLink, TriangleAlert } from "lucide-react";
import { SeoEditor } from "@/components/SeoEditor";
import { baliTime } from "@/lib/admin-ui";
import { isLive, writingChecks } from "@/lib/blog";
import { demoMode, site } from "@/lib/config";
import { defaultLlmsFacts, editablePages, freshSeoSettings, pageDefaults } from "@/lib/seo";
import { AI_CRAWLERS, SEO_PAGES, auditSite, effectiveText, type AuditItem, type PageText, type SeoLocale } from "@/lib/seo-settings";
import { listPosts } from "@/lib/store";
import { LOCALES, localizedPath } from "@/i18n/routing";
import { indexNowAction, saveCrawlersAction, saveFactsAction, saveVerificationAction } from "./actions";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, { ok: boolean; text: string }> = {
  ai: { ok: true, text: "AI access saved. robots.txt is updated." },
  facts: { ok: true, text: "Facts saved. llms.txt is updated." },
  search: { ok: true, text: "Verification codes saved. They are now in the pages for the search consoles to check." },
  key: { ok: true, text: "IndexNow key created. New articles will be announced when they are published." },
  "key-removed": { ok: true, text: "IndexNow key removed." },
  "ping-sent": { ok: true, text: "Bing and Yandex were told about every public page." },
  "ping-skipped": { ok: false, text: "Nothing was sent: this only works on the live site, with a key and your own https domain." },
  "ping-failed": { ok: false, text: "The announcement was refused. Check that the key file opens, then try again." },
};
const ICON = {
  pass: <CircleCheck className="h-5 w-5 shrink-0 text-tide-500" aria-hidden="true" />,
  warn: <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />,
  fail: <CircleX className="h-5 w-5 shrink-0 text-coral-600" aria-hidden="true" />,
};
const WORD = { pass: "OK", warn: "To improve", fail: "Blocking" };
const ORDER: Record<AuditItem["status"], number> = { fail: 0, warn: 1, pass: 2 };

function Section({ id, title, intro, children }: { id: string; title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-6">
      <h2 className="font-display text-2xl font-semibold text-deep-900">{title}</h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-500">{intro}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
const Out = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-deep-700 underline underline-offset-2">{children}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
);

export default async function AdminSeo({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const [settings, posts] = await Promise.all([freshSeoSettings(), listPosts()]);
  const groups = editablePages();

  const defaults: Record<string, Record<SeoLocale, PageText>> = {};
  for (const g of groups) for (const p of g.pages) {
    const byLocale = {} as Record<SeoLocale, PageText>;
    for (const l of LOCALES) byLocale[l] = pageDefaults(l, p.path) ?? { title: "", description: "" };
    defaults[p.path] = byLocale;
  }

  const audit = auditSite({
    demo: demoMode(), siteUrl: site.url, settings, posts,
    pages: SEO_PAGES.flatMap((p) => LOCALES.map((l) => ({ path: p.path, label: p.label, locale: l, ...effectiveText(settings, p.path, l, defaults[p.path][l]) }))),
    business: { whatsapp: site.whatsapp, address: site.address, company: site.company },
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const passed = audit.filter((a) => a.status === "pass").length;

  const now = new Date();
  const facts = settings.llmsFacts.length ? settings.llmsFacts : defaultLlmsFacts();
  const notice = done ? NOTICE[done] : undefined;
  const host = new URL(site.url).host;
  const groupsOf = [
    { use: "search" as const, title: "Assistants that answer questions and link to their sources", note: "Keep these on. An assistant that cannot read the site cannot recommend it." },
    { use: "training" as const, title: "Crawlers that collect text to train AI models", note: "Your choice. Allowing them helps future models know the brand; refusing them keeps your writing out of training sets and does not remove you from live AI answers." },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-deep-900">SEO &amp; AI</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-500">How the site presents itself to search engines (Google, Bing, Yandex) and to AI assistants (ChatGPT, Claude, Perplexity, Gemini). Changes apply to the site as soon as you save.</p>
        </div>
        <nav aria-label="Sections" className="flex flex-wrap gap-2 text-sm">
          {[["#health", "Health check"], ["#pages", "Titles"], ["#ai", "AI access"], ["#facts", "Facts for AI"], ["#search", "Search engines"], ["#articles", "Articles"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-mist-200 bg-white px-3 py-1.5 font-semibold text-deep-900 hover:border-deep-900/40">{label}</a>
          ))}
        </nav>
      </div>

      {notice && <p role="status" className={`mt-6 rounded-xl px-4 py-3 text-sm font-medium ${notice.ok ? "bg-tide-100 text-deep-900" : "bg-coral-50 text-coral-600"}`}>{notice.text}</p>}
      {demoMode() && <p className="mt-6 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900"><strong>Test site.</strong> Everything here can be prepared now, but search engines and AI crawlers are kept out until launch, so nothing will appear in results yet.</p>}

      <Section id="health" title="Health check" intro={<>{passed} of {audit.length} checks pass. The check reads the site&apos;s own settings and articles; it does not measure rankings.{settings.updatedAt && <> Settings last changed {baliTime(settings.updatedAt)}{settings.updatedBy ? ` by ${settings.updatedBy}` : ""}.</>}</>}>
        <ul className="divide-y divide-mist-200 rounded-2xl border border-mist-200 bg-white">
          {audit.map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-4 sm:px-5">
              {ICON[a.status]}
              <div className="min-w-0">
                <p className="font-semibold text-deep-900">{a.label} <span className="sr-only">({WORD[a.status]})</span></p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-700">{a.detail}</p>
                {a.fix && <p className="mt-1 text-sm leading-relaxed text-ink-500"><span className="font-semibold text-deep-700">What to do:</span> {a.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pages" title="Titles and descriptions" intro="The title and description are what people read in a search result, and what an AI assistant reads first. Each page has built-in wording in the three languages; write your own where you want to target the words your customers search for. The dot is green when all three languages have a good length.">
        <SeoEditor groups={groups} defaults={defaults} saved={settings.pages} host={host} />
        <p className="hint mt-3">Articles have their own title and summary in the Blog editor.</p>
      </Section>

      <Section id="ai" title="AI access" intro={<>Which AI crawlers may read the public pages. Your choices are written to <Out href="/robots.txt">robots.txt</Out>, the file crawlers read before visiting. Private pages (basket, checkout, orders, this console) are closed to all of them whatever you choose here.</>}>
        <form action={saveCrawlersAction} className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
          {groupsOf.map((g) => (
            <fieldset key={g.use} className="mb-6">
              <legend className="font-semibold text-deep-900">{g.title}</legend>
              <p className="hint">{g.note}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {AI_CRAWLERS.filter((c) => c.use === g.use).map((c) => (
                  <label key={c.agent} className="flex items-start gap-3 rounded-xl border border-mist-200 p-3 hover:border-deep-900/30">
                    <input type="checkbox" name="allow" value={c.agent} defaultChecked={!settings.blockedCrawlers.includes(c.agent)} className="checkbox" />
                    <span className="min-w-0 text-sm"><span className="block font-semibold text-deep-900">{c.agent}</span><span className="block text-ink-500">{c.owner}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn-primary btn-sm">Save AI access</button>
            <p className="text-sm text-ink-500">Ticked means allowed. Google AI Overviews and Bing Copilot use the ordinary Google and Bing crawlers, which are always allowed.</p>
          </div>
        </form>
      </Section>

      <Section id="facts" title="Facts for AI assistants" intro={<>Short statements about the business that an assistant can repeat safely. They are published in <Out href="/llms.txt">llms.txt</Out>, a plain map of the site written for AI, together with the list of pages and articles. One fact per line. Only write what is true and what you are allowed to claim: no medical promises.</>}>
        <form action={saveFactsAction} className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
          <label className="label" htmlFor="facts">Facts, one per line</label>
          <textarea id="facts" name="facts" rows={Math.max(7, facts.length + 1)} defaultValue={facts.join("\n")} className="input font-mono text-sm leading-relaxed" />
          <p className="hint">{settings.llmsFacts.length ? "You are using your own list." : "This is the built-in list. It follows the site's opening hours and delivery areas until you change it."} Up to 20 facts.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary btn-sm">Save facts</button>
            {settings.llmsFacts.length > 0 && <button type="submit" name="intent" value="reset" className="btn-secondary btn-sm">Go back to the built-in list</button>}
          </div>
        </form>
      </Section>

      <Section id="search" title="Search engines" intro="Connect the free webmaster tools to see which searches bring visitors, and to submit the sitemap. Each one gives you a meta tag to prove the site is yours: paste the whole tag or just its code here.">
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={saveVerificationAction} className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
            <h3 className="font-semibold text-deep-900">Ownership codes</h3>
            {([["google", "Google Search Console", "https://search.google.com/search-console", "Choose “URL prefix”, then the “HTML tag” method."], ["bing", "Bing Webmaster Tools", "https://www.bing.com/webmasters", "Also feeds ChatGPT search and Copilot. “HTML meta tag” method."], ["yandex", "Yandex Webmaster", "https://webmaster.yandex.com", "For Russian-speaking visitors. “Meta tag” method."]] as const).map(([name, label, href, how]) => (
              <div key={name} className="mt-4">
                <label className="label" htmlFor={`v-${name}`}>{label}</label>
                <input id={`v-${name}`} name={name} defaultValue={settings.verification[name]} className="input font-mono text-sm" autoComplete="off" spellCheck={false} placeholder="Paste the tag or the code" />
                <p className="hint">{how} <Out href={href}>Open</Out></p>
              </div>
            ))}
            <button type="submit" className="btn-primary btn-sm mt-5">Save codes</button>
            <p className="hint mt-3">After saving, go back to each tool and press Verify, then submit the sitemap: <span className="font-mono">{site.url}/sitemap.xml</span></p>
          </form>

          <div className="rounded-2xl border border-mist-200 bg-white p-5 sm:p-6">
            <h3 className="font-semibold text-deep-900">Instant notice of new articles (IndexNow)</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">Tells Bing and Yandex about an article the moment you publish it, instead of waiting for their next visit. Google does not use it; Google reads the sitemap.</p>
            {settings.indexNowKey ? (
              <>
                <p className="mt-4 text-sm text-ink-700">On. Key file: <Out href={`/${settings.indexNowKey}.txt`}>/{settings.indexNowKey.slice(0, 8)}….txt</Out></p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={indexNowAction}><button type="submit" name="intent" value="ping" className="btn-primary btn-sm">Announce all pages now</button></form>
                  <form action={indexNowAction}><button type="submit" name="intent" value="remove" className="btn-secondary btn-sm">Turn off</button></form>
                </div>
              </>
            ) : (
              <form action={indexNowAction} className="mt-4"><button type="submit" name="intent" value="create" className="btn-primary btn-sm">Create a key</button></form>
            )}
            <h3 className="mt-8 font-semibold text-deep-900">What crawlers are given</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
              <li><Out href="/sitemap.xml">sitemap.xml</Out> every public page and article, in three languages</li>
              <li><Out href="/robots.txt">robots.txt</Out> who may read what</li>
              <li><Out href="/llms.txt">llms.txt</Out> the site explained for AI assistants</li>
              <li><Out href="/api/feed/en">Article feed</Out> new articles, for readers and aggregators</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="articles" title="Articles" intro="Articles are what gets quoted. The score counts the points of the writing checklist (length, headings, sources, questions and answers, doctor review). Open an article to see which points are missing.">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-mist-200 bg-white p-6 text-sm text-ink-700">No articles yet. <a className="font-semibold text-deep-700 underline underline-offset-2" href="/admin/blog">Go to the Blog section</a> to write one or add the samples.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mist-200 bg-white">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-mist-100 text-xs uppercase tracking-wider text-ink-500">
                <tr><th scope="col" className="px-4 py-3">Article</th><th scope="col" className="px-4 py-3">Language</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Checklist</th><th scope="col" className="px-4 py-3">Still missing</th></tr>
              </thead>
              <tbody className="divide-y divide-mist-200">
                {posts.map((p) => {
                  const checks = writingChecks(p);
                  const missing = checks.filter((c) => !c.ok);
                  const live = isLive(p, now);
                  return (
                    <tr key={p.id} className="align-top hover:bg-mist-50">
                      <td className="px-4 py-3"><a className="font-semibold text-deep-700 underline underline-offset-2" href={`/admin/blog/${p.id}`}>{p.title}</a>{live && <> <a className="ml-1 text-ink-500 underline underline-offset-2" href={localizedPath(p.locale, `/blog/${p.slug}`)} target="_blank" rel="noopener noreferrer">view</a></>}</td>
                      <td className="px-4 py-3 uppercase">{p.locale}</td>
                      <td className="px-4 py-3">{live ? "Live" : p.status === "published" ? "Scheduled" : "Draft"}</td>
                      <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${missing.length === 0 ? "bg-tide-200 text-deep-900" : missing.length <= 2 ? "bg-lime-300 text-deep-900" : "bg-amber-100 text-amber-900"}`}>{checks.length - missing.length} of {checks.length}</span></td>
                      <td className="px-4 py-3 text-ink-700">{missing.length === 0 ? "Nothing" : missing.map((c) => c.label.replace(/\s*\(now [^)]*\)/, "")).slice(0, 3).join("; ") + (missing.length > 3 ? `; and ${missing.length - 3} more` : "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
