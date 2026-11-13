import { db } from "../db";
import { nowISO } from "../dates";
import type { AiEngine, VisibilityAnswer, VisibilityConfig, VisibilityPrompt, VisibilityRun } from "../types";
import { scoreAnswer, toCitations } from "./analyze";
import { rateSentiment } from "./claude";
import { configuredEngines, getConfig } from "./config";
import { askEngine } from "./engines";
import { summarise } from "./metrics";

/**
 * A run asks every active prompt to every configured assistant and stores one answer per pair.
 *
 * A full run takes longer than one serverless invocation, so it is resumable: the run row lists what to ask, the stored
 * answers say what is done, and `continueRun` works through the difference until its time budget is spent. The "Run now"
 * button calls it in a loop; the weekly cron starts a run and two later cron entries finish it. Answer ids are
 * deterministic, so two overlapping invocations at worst pay for the same answer twice.
 */

const CONCURRENCY = 4;
/** One assistant call (search + answer) is cut off after this long. */
const ANSWER_TIMEOUT_MS = 110_000;
const STALE_HOURS = 24;

export const answerId = (runId: string, promptId: string, engine: AiEngine) => `${runId}:${promptId}:${engine}`;

export interface RunProgress { runId: string; status: VisibilityRun["status"]; total: number; done: number; errors: number }

export async function runAnswers(runId: string): Promise<VisibilityAnswer[]> {
  return db.list("visibility_answers", { where: { runId } });
}

export async function listRuns(limit = 30): Promise<VisibilityRun[]> {
  return db.list("visibility_runs", { orderBy: "startedAt", desc: true, limit });
}

export function progressOf(run: VisibilityRun, answers: readonly VisibilityAnswer[]): RunProgress {
  return { runId: run.id, status: run.status, total: run.promptIds.length * run.engines.length, done: answers.length, errors: answers.filter((a) => a.error).length };
}

async function finish(run: VisibilityRun, answers: VisibilityAnswer[]): Promise<VisibilityRun> {
  const done: VisibilityRun = { ...run, status: "done", finishedAt: nowISO(), summary: summarise(answers) };
  await db.upsert("visibility_runs", done);
  return done;
}

/** The run in progress, if any. A run nobody finished within a day is closed with the answers it has. */
export async function openRun(): Promise<VisibilityRun | null> {
  const running = (await listRuns()).filter((r) => r.status === "running");
  let current: VisibilityRun | null = null;
  for (const r of running) {
    const stale = Date.now() - Date.parse(r.startedAt) > STALE_HOURS * 3_600_000;
    if (stale || current) await finish(r, await runAnswers(r.id)); else current = r;
  }
  return current;
}

export async function startRun(startedBy?: string): Promise<VisibilityRun> {
  const open = await openRun();
  if (open) return open;
  const engines = configuredEngines();
  if (engines.length === 0) throw new Error("No AI assistant is configured: add at least one API key (see AI visibility → Settings).");
  const prompts = await db.list("visibility_prompts", { where: (p) => p.active });
  if (prompts.length === 0) throw new Error("No active prompt to ask.");
  const run: VisibilityRun = { id: db.newId(), startedAt: nowISO(), status: "running", promptIds: prompts.map((p) => p.id), engines, startedBy };
  await db.insert("visibility_runs", run);
  return run;
}

async function answerOne(run: VisibilityRun, prompt: VisibilityPrompt, engine: AiEngine, config: VisibilityConfig): Promise<VisibilityAnswer> {
  const base = { id: answerId(run.id, prompt.id, engine), runId: run.id, promptId: prompt.id, engine, askedAt: nowISO() };
  try {
    const res = await askEngine(engine, prompt.text, ANSWER_TIMEOUT_MS);
    const citations = toCitations(res.citations);
    const score = scoreAnswer(res.text, citations, config);
    const tone = score.brandMentioned ? await rateSentiment(config, prompt.text, res.text) : null;
    return { ...base, model: res.model, text: res.text, citations, ...score, sentiment: tone?.sentiment, sentimentNote: tone?.note };
  } catch (e) {
    return { ...base, model: "", text: "", citations: [], brandMentioned: false, brandCited: false, competitors: [], error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
  }
}

/**
 * Asks what is still missing for `runId`, stopping to start new questions once `budgetMs` has passed (calls in flight
 * finish, so the invocation can last up to budgetMs + ANSWER_TIMEOUT_MS + the sentiment rating).
 */
export async function continueRun(runId: string, budgetMs = 120_000): Promise<RunProgress> {
  const run = await db.get("visibility_runs", runId);
  if (!run) throw new Error("Run not found");
  let answers = await runAnswers(runId);
  if (run.status === "done") return progressOf(run, answers);

  const config = await getConfig();
  const prompts = await db.getMany("visibility_prompts", run.promptIds);
  const have = new Set(answers.map((a) => a.id));
  const todo: Array<{ prompt: VisibilityPrompt; engine: AiEngine }> = [];
  // Interleave engines so one provider's rate limit is not hit by four calls at once.
  for (const promptId of run.promptIds) for (const engine of run.engines) {
    const prompt = prompts.get(promptId);
    if (prompt && !have.has(answerId(runId, promptId, engine))) todo.push({ prompt, engine });
  }
  const deadline = Date.now() + budgetMs;
  let next = 0;
  const made: VisibilityAnswer[] = [];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
    while (next < todo.length && Date.now() < deadline) {
      const job = todo[next++];
      const a = await answerOne(run, job.prompt, job.engine, config);
      await db.upsert("visibility_answers", a);
      made.push(a);
    }
  }));
  answers = [...answers, ...made];
  // A prompt deleted mid-run can never be answered: count what can still be asked, not the original plan.
  const remaining = todo.length - made.length;
  if (remaining === 0) return progressOf(await finish(run, answers), answers);
  return progressOf(run, answers);
}

/** Drops the failed answers of a run and reopens it, so the next `continueRun` asks them again. */
export async function retryErrors(runId: string): Promise<VisibilityRun | null> {
  const run = await db.get("visibility_runs", runId);
  if (!run) return null;
  if (await openRun().then((o) => o && o.id !== runId)) throw new Error("Another run is in progress.");
  for (const a of await runAnswers(runId)) if (a.error) await db.remove("visibility_answers", a.id);
  return db.update("visibility_runs", runId, { status: "running", finishedAt: undefined });
}

/** Cron entry point: continue the open run, or start one when asked to. */
export async function tick(start: boolean): Promise<RunProgress | { status: "idle" }> {
  const open = (await openRun()) ?? (start ? await startRun("cron") : null);
  if (!open) return { status: "idle" };
  return continueRun(open.id);
}

/** The most recent finished run and its answers, re-read by every page. */
export async function latestDone(): Promise<{ run: VisibilityRun; answers: VisibilityAnswer[] } | null> {
  const run = (await listRuns()).find((r) => r.status === "done" && (r.summary?.answers ?? 0) > 0);
  return run ? { run, answers: await runAnswers(run.id) } : null;
}
