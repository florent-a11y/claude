import { z } from "zod";
import { all, one } from "../db";
import type { Template, TemplateStep } from "../types";
import { normaliseRole } from "../roles";
export { normaliseRole, rolesOf } from "../roles";

const StepSchema = z.object({
  type: z.enum(["task", "file_request", "acknowledgement", "approval", "message"]),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).default(""),
  due_in_days: z.number().int().min(0).max(3650).nullable().default(null),
  assign_to: z.string().trim().max(60).default("Manager"),
  assignee_id: z.string().max(40).nullable().optional(),
  internal: z.boolean().default(false),
});

/** Validates the JSON the flow builder submits. Returns null when it is not a usable list of steps. */
export function parseStepsInput(json: string): TemplateStep[] | null {
  try {
    const parsed = z.array(StepSchema).max(200).safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return parsed.data.map((s) => ({ ...s, assign_to: normaliseRole(s.assign_to), assignee_id: s.assignee_id ?? null }));
  } catch {
    return null;
  }
}

export interface TemplateListRow extends Template {
  step_count: number;
  creator_name: string | null;
  last_used_at: string | null;
}

export function listTemplates(): TemplateListRow[] {
  return all<TemplateListRow>(
    `SELECT t.*, json_array_length(t.steps) AS step_count, u.name AS creator_name,
       (SELECT MAX(m.created_at) FROM messages m WHERE m.kind = 'system' AND m.body = 'applied the "' || t.name || '" flow (' || json_array_length(t.steps) || ' steps)') AS last_used_at
     FROM templates t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.name COLLATE NOCASE`,
  );
}

export function getTemplate(id: string): Template | undefined {
  return one<Template>("SELECT * FROM templates WHERE id = ?", id);
}

export function parseSteps(json: string): TemplateStep[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as TemplateStep[]).map((s) => ({ ...s, assign_to: normaliseRole(s.assign_to) })) : [];
  } catch {
    return [];
  }
}
