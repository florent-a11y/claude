import { test } from "node:test";
import assert from "node:assert/strict";
import { CheckoutProblem, tokenMatches, validateCheckout } from "../lib/checkout";
import { checkoutSchema, type CheckoutInput, type Order } from "../lib/schema";

// Wednesday 18 Nov 2026, 13:00 in Bali (05:00 UTC).
const NOW = new Date("2026-11-18T05:00:00Z");

function input(over: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    items: [{ slug: "electrolytes", qty: 1 }],
    contact: { name: "Test Customer", email: "customer@example.com", phone: "+62 812 0000 0000", locale: "en" },
    fulfilment: { mode: "address", area: "Canggu", address: "Villa Example, Jl. Example 1" },
    payment: "cod",
    consents: { terms: true, adult: true, medical: false },
    ...over,
  };
}
const health = { dob: "1990-05-20", sex: "female" as const, conditions: ["none" as const], allergies: "none", medications: "none", goals: "" };

function problem(fn: () => unknown): string {
  try { fn(); } catch (e) { if (e instanceof CheckoutProblem) return e.code; throw e; }
  return "";
}

test("a plain supplement order is accepted", () => {
  const r = validateCheckout(input(), NOW);
  assert.equal(r.q.hasRx, false);
  assert.equal(r.payment, "cod");
  assert.equal(r.health, undefined);
});

test("health answers are not kept when the basket does not need them", () => {
  assert.equal(validateCheckout(input({ health }), NOW).health, undefined);
});

test("an area outside the service zones is refused", () => {
  assert.equal(problem(() => validateCheckout(input({ fulfilment: { mode: "address", area: "Lombok", address: "Somewhere far away" } }), NOW)), "area");
});

test("a short address is refused", () => {
  assert.equal(problem(() => validateCheckout(input({ fulfilment: { mode: "address", area: "Canggu", address: "Villa" } }), NOW)), "address");
});

test("an order without prescription items must choose an available payment method", () => {
  assert.equal(problem(() => validateCheckout(input({ payment: undefined }), NOW)), "payment");
});

test("unknown products are refused", () => {
  assert.equal(problem(() => validateCheckout(input({ items: [{ slug: "made-up", qty: 1 }] }), NOW)), "items");
});

const drip = { items: [{ slug: "iv-hydration", qty: 1 }] };
const villa = { mode: "address" as const, area: "Canggu", address: "Villa Example, Jl. Example 1" };

test("a drip needs the questionnaire, the medical consent, a date and a window", () => {
  assert.equal(problem(() => validateCheckout(input({ ...drip }), NOW)), "dob");
  assert.equal(problem(() => validateCheckout(input({ ...drip, health }), NOW)), "consent");
  const consents = { terms: true as const, adult: true as const, medical: true };
  assert.equal(problem(() => validateCheckout(input({ ...drip, health, consents }), NOW)), "date");
  assert.equal(problem(() => validateCheckout(input({ ...drip, health, consents, fulfilment: { ...villa, date: "2026-11-19" } }), NOW)), "slot");
  const ok = validateCheckout(input({ ...drip, health, consents, fulfilment: { ...villa, date: "2026-11-19", slot: "10:00-12:00" } }), NOW);
  assert.equal(ok.fulfilment.slot, "10:00-12:00");
  assert.deepEqual(ok.health?.conditions, ["none"]);
});

const consents = { terms: true as const, adult: true as const, medical: true };

test("under-18s are refused", () => {
  const young = { ...health, dob: "2008-11-19" }; // turns 18 tomorrow
  assert.equal(problem(() => validateCheckout(input({ ...drip, health: young, consents, fulfilment: { ...villa, date: "2026-11-19", slot: "10:00-12:00" } }), NOW)), "underage");
});

test("past dates, dates too far ahead and windows already over today are refused", () => {
  const f = (date: string, slot: "08:00-10:00" | "10:00-12:00" | "12:00-14:00" | "14:00-16:00") => input({ ...drip, health, consents, fulfilment: { ...villa, date, slot } });
  assert.equal(problem(() => validateCheckout(f("2026-11-17", "10:00-12:00"), NOW)), "date");
  assert.equal(problem(() => validateCheckout(f("2026-12-19", "10:00-12:00"), NOW)), "date");
  assert.equal(problem(() => validateCheckout(f("2026-11-18", "10:00-12:00"), NOW)), "slot_passed"); // it is 13:00
  assert.equal(problem(() => validateCheckout(f("2026-11-18", "12:00-14:00"), NOW)), ""); // still running
  assert.equal(problem(() => validateCheckout(f("2026-11-18", "14:00-16:00"), NOW)), "");
});

test("'none' is dropped when a real condition is ticked as well", () => {
  const h = { ...health, conditions: ["none" as const, "diabetes" as const] };
  const r = validateCheckout(input({ ...drip, health: h, consents, fulfilment: { ...villa, date: "2026-11-19", slot: "10:00-12:00" } }), NOW);
  assert.deepEqual(r.health?.conditions, ["diabetes"]);
});

test("prescription items wait for the doctor: no payment method is taken at checkout", () => {
  const r = validateCheckout(input({ items: [{ slug: "bpc-157", qty: 1 }], health, consents, payment: "cod" }), NOW);
  assert.equal(r.q.hasRx, true);
  assert.equal(r.payment, undefined);
});

test("a membership alone needs no address", () => {
  const r = validateCheckout(input({ items: [{ slug: "member-essentials", qty: 1 }], fulfilment: { mode: "clinic" } }), NOW);
  assert.deepEqual(r.fulfilment, { mode: "clinic" });
});

test("the form schema refuses missing consents, bad emails and oversized quantities", () => {
  const base = input();
  assert.equal(checkoutSchema.safeParse(base).success, true);
  assert.equal(checkoutSchema.safeParse({ ...base, consents: { ...base.consents, terms: false } }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, consents: { ...base.consents, adult: false } }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, contact: { ...base.contact, email: "not-an-email" } }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, items: [{ slug: "creatine", qty: 11 }] }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, items: [] }).success, false);
});

test("the order link token is compared exactly", () => {
  const order = { token: "0123456789abcdef0123456789abcdef" } as Order;
  assert.equal(tokenMatches(order, "0123456789abcdef0123456789abcdef"), true);
  assert.equal(tokenMatches(order, "0123456789abcdef0123456789abcdee"), false);
  assert.equal(tokenMatches(order, "0123456789abcdef"), false);
  assert.equal(tokenMatches(order, ""), false);
  assert.equal(tokenMatches(order, undefined), false);
});
