/**
 * AI readiness self-assessment: questions, scoring and recommendations. Pure functions with no UI, so the
 * same logic runs in the browser (instant result) and on the server (re-scored when a lead is saved).
 */
import type { AuditTierId } from "./config";

export const QUESTIONS = [
  { id: "sector", multi: false, options: ["hospitality", "food", "services", "trading", "other"] },
  { id: "team", multi: false, options: ["micro", "small", "medium"] },
  { id: "channel", multi: false, options: ["whatsapp", "social", "phone", "platform", "walkin"] },
  { id: "volume", multi: false, options: ["lt10", "10to50", "50to200", "gt200"] },
  { id: "afterHours", multi: false, options: ["minutes", "hours", "nextDay"] },
  { id: "languages", multi: false, options: ["one", "two", "many"] },
  { id: "tasks", multi: true, options: ["faq", "booking", "invoices", "reports", "content", "stock", "hr"] },
  { id: "data", multi: false, options: ["paper", "sheets", "software", "mixed"] },
  { id: "aiUse", multi: false, options: ["never", "personal", "work"] },
  { id: "owner", multi: false, options: ["owner", "manager", "nobody"] },
] as const;

export type QuestionId = (typeof QUESTIONS)[number]["id"];
type OptionOf<Q extends QuestionId> = Extract<(typeof QUESTIONS)[number], { id: Q }>["options"][number];

export type Task = OptionOf<"tasks">;
export type QuizAnswers = {
  sector: OptionOf<"sector">;
  team: OptionOf<"team">;
  channel: OptionOf<"channel">;
  volume: OptionOf<"volume">;
  afterHours: OptionOf<"afterHours">;
  languages: OptionOf<"languages">;
  tasks: Task[];
  data: OptionOf<"data">;
  aiUse: OptionOf<"aiUse">;
  owner: OptionOf<"owner">;
};

export type Profile = "ready" | "foundations" | "tune" | "start";
export type Recommendation =
  | "digitize"
  | "training"
  | "autoReply"
  | "multilingual"
  | "booking"
  | "invoices"
  | "reports"
  | "content"
  | "stock"
  | "hr";

export type QuizResult = {
  /** How much repetitive work AI could take over, 0–100. */
  opportunity: number;
  /** How easily the business can adopt it today, 0–100. */
  readiness: number;
  profile: Profile;
  recommendations: Recommendation[];
  tier: AuditTierId;
};

const VOLUME: Record<QuizAnswers["volume"], number> = { lt10: 0, "10to50": 10, "50to200": 20, gt200: 30 };
const AFTER_HOURS: Record<QuizAnswers["afterHours"], number> = { minutes: 0, hours: 8, nextDay: 15 };
const LANGUAGES: Record<QuizAnswers["languages"], number> = { one: 0, two: 6, many: 13 };
const CHANNEL: Record<QuizAnswers["channel"], number> = { whatsapp: 10, social: 10, platform: 6, phone: 5, walkin: 2 };
const DATA: Record<QuizAnswers["data"], number> = { paper: 5, mixed: 20, sheets: 30, software: 40 };
const AI_USE: Record<QuizAnswers["aiUse"], number> = { never: 5, personal: 18, work: 30 };
const OWNER: Record<QuizAnswers["owner"], number> = { nobody: 0, manager: 22, owner: 30 };

const TASK_POINTS = 8;
const MAX_SCORED_TASKS = 4;
const MAX_RECOMMENDATIONS = 3;

/** Each time-consuming task maps to the solution that removes it. Order = priority when several apply. */
const TASK_RECOMMENDATION: [Task, Recommendation][] = [
  ["faq", "autoReply"],
  ["booking", "booking"],
  ["invoices", "invoices"],
  ["reports", "reports"],
  ["stock", "stock"],
  ["content", "content"],
  ["hr", "hr"],
];

export function scoreQuiz(a: QuizAnswers): QuizResult {
  const tasks = [...new Set(a.tasks)];
  const opportunity =
    VOLUME[a.volume] +
    AFTER_HOURS[a.afterHours] +
    LANGUAGES[a.languages] +
    CHANNEL[a.channel] +
    Math.min(tasks.length, MAX_SCORED_TASKS) * TASK_POINTS;
  const readiness = DATA[a.data] + AI_USE[a.aiUse] + OWNER[a.owner];

  const profile: Profile =
    opportunity >= 50 ? (readiness >= 50 ? "ready" : "foundations") : readiness >= 50 ? "tune" : "start";

  const recs: Recommendation[] = [];
  // Foundations come first: an assistant cannot answer from information that only exists on paper.
  if (a.data === "paper") recs.push("digitize");
  const busyInbox = a.volume !== "lt10" && (a.channel === "whatsapp" || a.channel === "social");
  if (tasks.includes("faq") || busyInbox) recs.push("autoReply");
  if (a.languages === "many") recs.push("multilingual");
  for (const [task, rec] of TASK_RECOMMENDATION) if (tasks.includes(task)) recs.push(rec);
  if (a.aiUse === "never") recs.push("training");
  if (recs.length === 0) recs.push("reports");

  return {
    opportunity,
    readiness,
    profile,
    recommendations: [...new Set(recs)].slice(0, MAX_RECOMMENDATIONS),
    tier: a.team,
  };
}

/** True when every question has a valid answer (tasks may be empty: "none of these" is a real answer). */
export function isComplete(a: Partial<QuizAnswers>): a is QuizAnswers {
  return QUESTIONS.every((q) => {
    const value = a[q.id];
    if (q.multi) return Array.isArray(value) && value.every((v) => (q.options as readonly string[]).includes(v));
    return typeof value === "string" && (q.options as readonly string[]).includes(value);
  });
}
