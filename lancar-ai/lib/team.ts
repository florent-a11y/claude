/** The founders, shown on the home and About pages. Role labels are translated in content/*.ts (founders.roles). */
export const FOUNDERS = [
  { name: "Florent Delente", role: "ceo" },
  { name: "Luis Elliot", role: "cto" },
  { name: "Ari Sandi", role: "sales" },
] as const;

export function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
