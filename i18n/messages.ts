import { routing } from "./routing";
import en from "../messages/en.json";

export type Messages = Record<string, unknown>;

/** Deep-merges locale messages over the English catalog so any key missing (or left empty)
 *  in a translation renders the English text instead of the key path. */
function mergeMessages(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)) {
      out[k] = mergeMessages(b as Messages, v as Messages);
    } else if (v !== undefined && v !== null && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

/** Looks up a dotted key ("Home.hero.title") in the English catalog. */
export function englishText(path: string): string | undefined {
  let cur: unknown = en;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Messages)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Messages for a locale, with English filling every gap. Unknown locales get English. */
export async function loadMessages(locale: string): Promise<Messages> {
  if (locale === routing.defaultLocale || !(routing.locales as readonly string[]).includes(locale)) return en as Messages;
  try {
    const mod = (await import(`../messages/${locale}.json`)) as { default: Messages };
    return mergeMessages(en as Messages, mod.default);
  } catch {
    return en as Messages;
  }
}

/** English fallback for a missing key (used by getMessageFallback). */
export function messageFallback({ namespace, key }: { namespace?: string; key: string }) {
  const path = namespace ? `${namespace}.${key}` : key;
  return englishText(path) ?? path;
}
