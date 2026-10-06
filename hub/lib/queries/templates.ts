import { all, one } from "../db";
import type { Template, TemplateStep } from "../types";

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
