import { db } from "../db";
import { nowISO } from "../dates";
import { AI_ENGINES, type AiEngine, type VisibilityConfig } from "../types";

/** Brand, competitors and prompts for the AI visibility module. The config lives in `settings` under one id. */

const SETTING_ID = "visibility";

export const DEFAULT_CONFIG: VisibilityConfig = {
  brandName: "ILA Global Consulting",
  brandAliases: ["ILA Global", "PT ILA Global Consulting", "ILA Consulting"],
  domains: ["ilaglobalconsulting.com"],
  description: "Bali-based consultancy for foreigners and foreign-owned companies in Indonesia: company setup (PT PMA), visas and KITAS, accounting, tax compliance and payroll.",
  competitors: [
    { name: "Emerhub", domains: ["emerhub.com"] },
    { name: "Cekindo", aliases: ["InCorp Indonesia", "InCorp"], domains: ["cekindo.com", "incorp.asia"] },
    { name: "LetsMoveIndonesia", aliases: ["Lets Move Indonesia", "Let's Move Indonesia"], domains: ["letsmoveindonesia.com"] },
  ],
};

/** Starting prompt list: the four gaps first reported for ILA, then one buyer question per service line. */
export const DEFAULT_PROMPTS: Array<{ text: string; topic: string }> = [
  { topic: "Company setup", text: "how much does it cost to set up a PT in Indonesia 2026" },
  { topic: "Tax", text: "do I need to file taxes in Indonesia if I'm a foreign resident" },
  { topic: "Visas", text: "how to sponsor an Indonesia work visa for foreign employees 2026" },
  { topic: "Property", text: "can foreigners own freehold property in Indonesia or only leasehold" },
  { topic: "Company setup", text: "best company formation agent in Bali for a PT PMA" },
  { topic: "Company setup", text: "what is the minimum capital for a PT PMA in Indonesia" },
  { topic: "Visas", text: "best visa agent in Bali for an investor KITAS" },
  { topic: "Visas", text: "how to get a digital nomad or remote worker visa for Bali" },
  { topic: "Tax", text: "who can do the accounting and monthly tax reporting for my PT PMA in Bali" },
  { topic: "Tax", text: "what taxes does a foreign-owned company pay in Indonesia" },
  { topic: "Payroll", text: "how do payroll and BPJS work for employees of a PT PMA" },
  { topic: "Compliance", text: "what is LKPM reporting and who can file it for my Indonesian company" },
];

function clean(c: Partial<VisibilityConfig> | null | undefined): VisibilityConfig {
  return {
    brandName: c?.brandName?.trim() || DEFAULT_CONFIG.brandName,
    brandAliases: c?.brandAliases ?? DEFAULT_CONFIG.brandAliases,
    domains: c?.domains?.length ? c.domains : DEFAULT_CONFIG.domains,
    description: c?.description ?? DEFAULT_CONFIG.description,
    competitors: c?.competitors ?? DEFAULT_CONFIG.competitors,
  };
}

export async function getConfig(): Promise<VisibilityConfig> {
  const row = await db.get("settings", SETTING_ID);
  return clean(row?.value as Partial<VisibilityConfig> | undefined);
}

export async function saveConfig(config: VisibilityConfig): Promise<void> {
  await db.upsert("settings", { id: SETTING_ID, value: clean(config), updatedAt: nowISO() });
}

/** Adds the starting prompts the first time the module is opened with an empty list. */
export async function ensurePrompts(): Promise<void> {
  if ((await db.list("visibility_prompts", { limit: 1 })).length > 0) return;
  const createdAt = nowISO();
  await db.insertMany("visibility_prompts", DEFAULT_PROMPTS.map((p) => ({ id: db.newId(), text: p.text, topic: p.topic, active: true, createdAt })));
}

export const ENGINE_KEYS: Record<AiEngine, string> = { chatgpt: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", perplexity: "PERPLEXITY_API_KEY" };

/** The assistants that have an API key in this deployment. */
export function configuredEngines(): AiEngine[] {
  return AI_ENGINES.filter((e) => !!process.env[ENGINE_KEYS[e]]?.trim());
}
