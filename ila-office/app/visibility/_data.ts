import { db } from "@/lib/db";
import type { AiEngine, VisibilityAnswer, VisibilityConfig, VisibilityPrompt, VisibilityRun } from "@/lib/types";
import { configuredEngines, ensurePrompts, getConfig } from "@/lib/visibility/config";
import { rescore } from "@/lib/visibility/metrics";
import { latestDone, listRuns, progressOf, runAnswers, type RunProgress } from "@/lib/visibility/run";

export interface VisibilityData {
  config: VisibilityConfig;
  prompts: VisibilityPrompt[];
  /** Assistants with an API key in this deployment. */
  engines: AiEngine[];
  /** The latest finished run and its answers, scored with today's brand and competitor lists. */
  run: VisibilityRun | null;
  answers: VisibilityAnswer[];
  runs: VisibilityRun[];
  /** A run in progress, for the "Run now" button to pick up. */
  open: RunProgress | null;
}

/** Everything the visibility pages read. Seeds the starting prompt list on first use. */
export async function loadVisibility(): Promise<VisibilityData> {
  await ensurePrompts();
  const [config, prompts, runs, latest] = await Promise.all([getConfig(), db.list("visibility_prompts", { orderBy: "createdAt" }), listRuns(), latestDone()]);
  const running = runs.find((r) => r.status === "running");
  return {
    config, prompts, engines: configuredEngines(), runs,
    run: latest?.run ?? null, answers: latest ? rescore(latest.answers, config) : [],
    open: running ? progressOf(running, await runAnswers(running.id)) : null,
  };
}
