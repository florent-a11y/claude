import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import type { VisibilityArticle } from "@/lib/types";
import { domainIn, toCitations } from "@/lib/visibility/analyze";
import { claudeError, draftArticle } from "@/lib/visibility/claude";
import { getConfig } from "@/lib/visibility/config";
import { latestDone } from "@/lib/visibility/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Research with web search plus a 1,000-word draft: a few minutes. */
export const maxDuration = 300;

/**
 * POST /api/visibility/articles { promptId } | { question } → drafts an article answering the question, grounded in web
 * sources and aware of the pages assistants cite today, and stores it as a draft. Returns { id }.
 */
export async function POST(req: Request) {
  const user = await guard("crm:write");
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as { promptId?: string; question?: string };
  const prompt = body.promptId ? await db.get("visibility_prompts", body.promptId) : null;
  const question = (prompt?.text ?? body.question ?? "").trim();
  if (question.length < 8 || question.length > 300) return Response.json({ ok: false, error: "Give a question of 8 to 300 characters." }, { status: 400 });
  try {
    const config = await getConfig();
    // The pages cited for this prompt today, most cited first; ILA's own and Gemini's redirect links left out.
    const counts = new Map<string, number>();
    if (prompt) for (const a of (await latestDone())?.answers ?? []) {
      if (a.promptId !== prompt.id || a.error) continue;
      for (const c of a.citations) if (!domainIn(c.domain, config.domains) && !/vertexaisearch/.test(c.url)) counts.set(c.url, (counts.get(c.url) ?? 0) + 1);
    }
    const cited = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([url]) => url);
    const draft = await draftArticle(config, question, cited, 270_000);
    if (draft.markdown.length < 400) throw new Error("The draft came back empty. Try again.");
    const article: VisibilityArticle = {
      id: db.newId(), promptId: prompt?.id, question, title: draft.title, metaDescription: draft.metaDescription, markdown: draft.markdown,
      sources: toCitations(draft.citations), status: "draft", createdAt: nowISO(), createdBy: user.id,
    };
    await db.insert("visibility_articles", article);
    return Response.json({ ok: true, id: article.id });
  } catch (e) {
    return Response.json({ ok: false, error: claudeError(e) }, { status: 502 });
  }
}
