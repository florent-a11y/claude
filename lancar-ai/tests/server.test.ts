import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIT_TIERS, formatIdr } from "../lib/config";
import { buildSystemPrompt, isPersonaId, PERSONA_IDS, PERSONAS } from "../lib/demo";
import { LeadInput, toLead } from "../lib/leads";
import { rateLimit } from "../lib/rate-limit";

const validLead = {
  source: "contact",
  locale: "id",
  name: "Made Wirawan",
  business: "Warung Contoh",
  whatsapp: "+62 812-3456-7890",
  email: "",
  location: "bali",
  sector: "food",
  team: "micro",
  message: "",
  consent: true,
};

test("a valid lead is accepted and trimmed", () => {
  const parsed = LeadInput.parse({ ...validLead, name: "  Made Wirawan  " });
  assert.equal(parsed.name, "Made Wirawan");
  assert.equal(toLead(parsed).quiz, null);
});

test("a lead needs consent, a real phone number and a known location", () => {
  assert.equal(LeadInput.safeParse({ ...validLead, consent: false }).success, false);
  assert.equal(LeadInput.safeParse({ ...validLead, whatsapp: "call me" }).success, false);
  assert.equal(LeadInput.safeParse({ ...validLead, whatsapp: "12345" }).success, false);
  assert.equal(LeadInput.safeParse({ ...validLead, location: "mars" }).success, false);
  assert.equal(LeadInput.safeParse({ ...validLead, email: "not-an-email" }).success, false);
  assert.equal(LeadInput.safeParse({ ...validLead, email: "owner@example.com" }).success, true);
  assert.equal(LeadInput.safeParse({ ...validLead, whatsapp: "081234567890" }).success, true);
});

test("quiz results are recomputed on the server, and malformed answers are dropped", () => {
  const answers = {
    sector: "food", team: "micro", channel: "whatsapp", volume: "10to50", afterHours: "hours",
    languages: "two", tasks: ["faq"], data: "sheets", aiUse: "personal", owner: "owner",
  };
  const lead = toLead(LeadInput.parse({ ...validLead, source: "quiz", quiz: answers }));
  assert.equal(lead.quiz?.result.opportunity, 10 + 8 + 6 + 10 + 8);
  assert.equal(lead.quiz?.result.readiness, 30 + 18 + 30);
  assert.equal(toLead(LeadInput.parse({ ...validLead, source: "quiz", quiz: { ...answers, volume: "999" } })).quiz, null);
  assert.equal(toLead(LeadInput.parse({ ...validLead, source: "quiz", quiz: "opportunity: 100" })).quiz, null);
});

test("the system prompt carries the fact sheet and the local date of the business", () => {
  const prompt = buildSystemPrompt("spa", new Date("2026-11-17T15:30:00Z"));
  assert.ok(prompt.includes(PERSONAS.spa.factSheet));
  assert.ok(prompt.includes("Tuesday, 17 November 2026"));
  // Ubud is UTC+8: 15:30 UTC is 23:30 local.
  assert.ok(prompt.includes("23:30"));
  for (const persona of PERSONA_IDS) assert.ok(buildSystemPrompt(persona).includes(PERSONAS[persona].name));
});

test("only the four demo businesses are accepted", () => {
  assert.equal(isPersonaId("clinic"), true);
  assert.equal(isPersonaId("bank"), false);
  assert.equal(isPersonaId(undefined), false);
});

test("the rate limiter blocks after the limit and recovers after the window", () => {
  const key = `test:${Math.random()}`;
  assert.equal(rateLimit(key, 2, 1000, 0), true);
  assert.equal(rateLimit(key, 2, 1000, 10), true);
  assert.equal(rateLimit(key, 2, 1000, 20), false);
  assert.equal(rateLimit(key, 2, 1000, 1005), true);
});

test("audit prices are formatted per language", () => {
  assert.equal(formatIdr(AUDIT_TIERS[0].priceIdr, "id"), "Rp 3.500.000");
  assert.equal(formatIdr(AUDIT_TIERS[0].priceIdr, "en"), "IDR 3,500,000");
  assert.deepEqual(AUDIT_TIERS.map((tier) => tier.priceIdr), [3_500_000, 7_500_000, 15_000_000]);
});

test("the site address follows NEXT_PUBLIC_SITE_URL, then the Vercel deployment, then localhost", async () => {
  const load = async (env: Record<string, string>) => {
    const saved = { ...process.env };
    for (const key of ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) delete process.env[key];
    Object.assign(process.env, env);
    try {
      // A fresh copy of the module each time: the address is read once, when the module loads.
      const mod = (await import(`../lib/config.ts?case=${Math.random()}`)) as typeof import("../lib/config");
      return mod.site.url;
    } finally {
      process.env = saved;
    }
  };
  assert.equal(await load({}), "http://localhost:3200");
  assert.equal(await load({ NEXT_PUBLIC_SITE_URL: "https://lancar.example/" }), "https://lancar.example");
  assert.equal(await load({ VERCEL_ENV: "preview", VERCEL_URL: "lancar-ai-abc.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "lancar-ai.vercel.app" }), "https://lancar-ai-abc.vercel.app");
  assert.equal(await load({ VERCEL_ENV: "production", VERCEL_URL: "lancar-ai-abc.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "lancar-ai.vercel.app" }), "https://lancar-ai.vercel.app");
  assert.equal(await load({ NEXT_PUBLIC_SITE_URL: "https://lancar.example", VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" }), "https://lancar.example");
});
