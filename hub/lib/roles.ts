import { BUILT_IN_ROLES, type TemplateStep } from "./types";

/** Older templates stored team / client / none; map them to role names. */
export function normaliseRole(v: unknown): string {
  if (typeof v !== "string") return "Manager";
  if (v === "team") return "Manager";
  if (v === "client") return "Client";
  if (v === "none") return "";
  return v.trim().slice(0, 60);
}

/** Distinct roles used by a list of steps, built-in ones first. */
export function rolesOf(steps: TemplateStep[]): string[] {
  const set = new Set<string>();
  for (const s of steps) if (s.assign_to && s.type !== "message") set.add(s.assign_to);
  return [...BUILT_IN_ROLES.filter((r) => set.has(r)), ...[...set].filter((r) => !(BUILT_IN_ROLES as readonly string[]).includes(r)).sort()];
}
