import { notFound } from "next/navigation";
import { can, requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { renderMarkdown } from "@/lib/visibility/markdown";
import { Badge, Card, Field, Notice, Page } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { Prose } from "../../_components/bits";
import { CopyText } from "../../_components/Controls";
import { deleteArticle, saveArticle } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Article · AI visibility" };

export default async function Article({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const me = await requireTeam();
  const write = can(me, "crm:write");
  const { id } = await params;
  const { msg } = await searchParams;
  const a = await db.get("visibility_articles", id);
  if (!a) notFound();
  const html = renderMarkdown(a.markdown);
  return (
    <Page title={a.title} subtitle={<>Answers: {a.question} · drafted {fmtDateTime(a.createdAt)} {a.status === "published" ? <Badge tone="green" className="ml-1">published</Badge> : <Badge className="ml-1">draft</Badge>}</>}
      breadcrumbs={[{ href: "/visibility", label: "AI visibility" }, { href: "/visibility/articles", label: "Articles" }, { label: "Article" }]}
      actions={<><CopyText value={a.markdown} label="Copy Markdown" /><CopyText value={html} label="Copy HTML" /></>}>
      {msg && <div className="mb-3"><Notice tone="blue">{msg}</Notice></div>}
      {a.status === "draft" && <div className="mb-4"><Notice>Draft written by AI from web sources. Before publishing, have a consultant check every figure, fee, rate and regulation number against the sources listed below: rules change and a wrong number on ILA's site is worse than no article.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          {a.metaDescription && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-xs text-ink-700"><span className="font-semibold">Meta description:</span> {a.metaDescription}</p>}
          <Prose html={html} />
        </Card>
        <div className="space-y-4">
          <Card title={`Sources used · ${a.sources.length}`}>
            {a.sources.length === 0 ? <p className="text-xs text-ink-500">No source was recorded: check every fact by hand.</p> : (
              <ul className="space-y-1.5 text-xs">{a.sources.map((s) => <li key={s.url} className="truncate"><span className="mr-1 font-medium text-ink-700">{s.domain}</span><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-ink-500 hover:underline">{s.title ?? s.url}</a></li>)}</ul>
            )}
          </Card>
          <Card title="Publishing checklist">
            <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-700">
              <li>Verify figures and regulation numbers against the sources.</li>
              <li>Add the author (a named consultant) and today's date.</li>
              <li>Publish on {`ILA's`} site with the title as the page h1 and the meta description above.</li>
              <li>Add Article and FAQPage structured data, and link the article from the matching service page.</li>
              <li>Paste the live URL below, then watch the prompt on the next runs.</li>
            </ol>
          </Card>
        </div>
      </div>
      {write && (
        <Card title="Edit" className="mt-4">
          <form action={saveArticle.bind(null, a.id)} className="space-y-3">
            <Field label="Title"><input name="title" className="input" defaultValue={a.title} required maxLength={200} /></Field>
            <Field label="Meta description"><input name="metaDescription" className="input" defaultValue={a.metaDescription} maxLength={300} /></Field>
            <Field label="Article (Markdown)"><textarea name="markdown" className="input font-mono text-xs" rows={18} defaultValue={a.markdown} required /></Field>
            <Field label="Published URL" hint="Filling this in marks the article as published."><input name="publishedUrl" type="url" className="input" defaultValue={a.publishedUrl} placeholder="https://…" /></Field>
            <SubmitButton>Save</SubmitButton>
          </form>
          <ConfirmForm action={deleteArticle.bind(null, a.id)} message="Delete this article?" className="mt-3 block"><button className="text-xs text-red-700 hover:underline">Delete article</button></ConfirmForm>
        </Card>
      )}
    </Page>
  );
}
