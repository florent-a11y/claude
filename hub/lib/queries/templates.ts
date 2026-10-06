import { z } from "zod";
import { all, one } from "../db";
import type { Template, TemplateStep } from "../types";

const StepSchema = z.object({
  type: z.enum(["task", "file_request", "approval", "message"]),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).default(""),
  due_in_days: z.number().int().min(0).max(3650).nullable().default(null),
  assign_to: z.enum(["team", "client", "none"]).default("team"),
  assignee_id: z.string().max(40).nullable().optional(),
  internal: z.boolean().default(false),
});

/** Validates the JSON the flow builder submits. Returns null when it is not a usable list of steps. */
export function parseStepsInput(json: string): TemplateStep[] | null {
  try {
    const parsed = z.array(StepSchema).max(200).safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return parsed.data.map((s) => ({ ...s, assignee_id: s.assignee_id ?? null }));
  } catch {
    return null;
  }
}

export function listTemplates(): (Template & { step_count: number })[] {
  return all<Template & { step_count: number }>(
    "SELECT t.*, json_array_length(t.steps) AS step_count FROM templates t ORDER BY t.name COLLATE NOCASE",
  );
}

export function getTemplate(id: string): Template | undefined {
  return one<Template>("SELECT * FROM templates WHERE id = ?", id);
}

export function parseSteps(json: string): TemplateStep[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as TemplateStep[]) : [];
  } catch {
    return [];
  }
}
