/**
 * Lead capture: validation, storage and the notification email. A lead is saved to Supabase when it is
 * configured, and a notification is emailed through Resend when that is configured. Locally, with neither,
 * leads go to data/leads.json so the forms can be tried end to end.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { site } from "./config";
import { EMAIL_PATTERN, LEAD_LOCATIONS, LEAD_SECTORS, LEAD_TEAMS, WHATSAPP_PATTERN } from "./lead-fields";
import { isComplete, scoreQuiz, type QuizAnswers, type QuizResult } from "./quiz";

export const LeadInput = z.object({
  source: z.enum(["contact", "quiz"]),
  locale: z.enum(["id", "en"]),
  name: z.string().trim().min(2).max(100),
  business: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().max(30).regex(WHATSAPP_PATTERN),
  email: z.string().trim().max(200).regex(EMAIL_PATTERN).or(z.literal("")).default(""),
  location: z.enum(LEAD_LOCATIONS),
  sector: z.enum(LEAD_SECTORS),
  team: z.enum(LEAD_TEAMS),
  message: z.string().trim().max(2000).default(""),
  consent: z.literal(true),
  quiz: z.unknown().optional(),
});

export type Lead = Omit<z.infer<typeof LeadInput>, "quiz" | "consent"> & {
  quiz: { answers: QuizAnswers; result: QuizResult } | null;
};

/** Validated lead, with the quiz re-scored on the server so the stored result cannot be tampered with. */
export function toLead(input: z.infer<typeof LeadInput>): Lead {
  const { quiz, consent: _consent, ...rest } = input;
  const answers = quiz && typeof quiz === "object" && isComplete(quiz as Partial<QuizAnswers>) ? (quiz as QuizAnswers) : null;
  return { ...rest, quiz: answers ? { answers, result: scoreQuiz(answers) } : null };
}

const TIMEOUT_MS = 8000;

async function storeInSupabase(lead: Lead) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/leads`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase insert failed: ${response.status} ${await response.text()}`);
  return true;
}

async function storeInLocalFile(lead: Lead) {
  if (process.env.NODE_ENV === "production") return false;
  const file = path.join(process.cwd(), "data", "leads.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const existing: unknown[] = await fs.readFile(file, "utf8").then(
    (text) => JSON.parse(text) as unknown[],
    () => [],
  );
  existing.push({ ...lead, created_at: new Date().toISOString() });
  await fs.writeFile(file, JSON.stringify(existing, null, 2));
  return true;
}

function emailText(lead: Lead) {
  const lines = [
    `Source: ${lead.source} (${lead.locale})`,
    `Name: ${lead.name}`,
    `Business: ${lead.business}`,
    `WhatsApp: ${lead.whatsapp}`,
    `Email: ${lead.email || "-"}`,
    `Location: ${lead.location}`,
    `Sector: ${lead.sector}`,
    `Team size: ${lead.team}`,
    `Message: ${lead.message || "-"}`,
  ];
  if (lead.quiz) {
    const { result, answers } = lead.quiz;
    lines.push(
      "",
      `Quiz: opportunity ${result.opportunity}/100, readiness ${result.readiness}/100, profile "${result.profile}"`,
      `Suggested: ${result.recommendations.join(", ")}`,
      `Answers: ${JSON.stringify(answers)}`,
    );
  }
  return lines.join("\n");
}

async function notifyByEmail(lead: Lead) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_EMAIL;
  const from = process.env.EMAIL_FROM;
  if (!key || !to || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((address) => address.trim()),
      subject: `New ${site.name} lead: ${lead.business} (${lead.location})`.replace(/\s+/g, " "),
      text: emailText(lead),
      ...(lead.email ? { reply_to: lead.email } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  return true;
}

/**
 * Saves and announces a lead. Each channel fails on its own: a lead that reaches either the database or the
 * inbox is not lost. The caller must treat `stored: false, notified: false` as a failure and say so.
 */
export async function saveLead(lead: Lead) {
  const attempt = async (label: string, run: () => Promise<boolean>) => {
    try {
      return await run();
    } catch (error) {
      console.error(`[leads] ${label}:`, error instanceof Error ? error.message : error);
      return false;
    }
  };
  const stored = (await attempt("store", () => storeInSupabase(lead))) || (await attempt("local file", () => storeInLocalFile(lead)));
  const notified = await attempt("email", () => notifyByEmail(lead));
  return { stored, notified };
}
