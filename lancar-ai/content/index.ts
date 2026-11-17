import type { AppLocale } from "@/i18n/routing";
import { en, type Dictionary } from "./en";
import { id } from "./id";

const DICTIONARIES: Record<AppLocale, Dictionary> = { en, id };

export type { Dictionary };

export function getDictionary(locale: string): Dictionary {
  return DICTIONARIES[locale as AppLocale] ?? id;
}

/** Fills {placeholders} in a dictionary string: fill("Question {n} of {total}", { n: 2, total: 10 }). */
export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
