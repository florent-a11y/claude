import { test } from "node:test";
import assert from "node:assert/strict";
import { quote, feesFor } from "../lib/pricing";
import { PRODUCTS, getProduct } from "../lib/catalog";
import { FREE_DELIVERY_FROM_IDR, ZONES, zoneFor } from "../lib/config";
import { ageOn } from "../lib/schema";
import en from "../messages/en.json";
import ru from "../messages/ru.json";
import fr from "../messages/fr.json";

const price = (slug: string) => getProduct(slug)!.priceIdr;
const canggu = zoneFor("Canggu")!;
const ubud = zoneFor("Ubud")!;

test("supplements to an address pay the zone's delivery fee", () => {
  const q = quote([{ slug: "electrolytes", qty: 2 }], { mode: "address", area: "Ubud" });
  assert.equal(q.subtotalIdr, 2 * price("electrolytes"));
  assert.equal(q.deliveryIdr, ubud.deliveryIdr);
  assert.equal(q.calloutIdr, 0);
  assert.equal(q.totalIdr, q.subtotalIdr + ubud.deliveryIdr);
  assert.equal(q.hasRx, false);
  assert.equal(q.needsHealth, false);
});

test("collecting at the lounge is free", () => {
  const q = quote([{ slug: "electrolytes", qty: 1 }], { mode: "clinic" });
  assert.equal(q.deliveryIdr + q.calloutIdr, 0);
});

test("delivery is free from the threshold", () => {
  const qty = Math.ceil(FREE_DELIVERY_FROM_IDR / price("collagen-peptides"));
  const q = quote([{ slug: "collagen-peptides", qty }], { mode: "address", area: "Canggu" });
  assert.ok(q.subtotalIdr >= FREE_DELIVERY_FROM_IDR);
  assert.equal(q.deliveryIdr, 0);
});

test("a nurse visit charges the call-out fee and carries products for free", () => {
  const q = quote([{ slug: "iv-hydration", qty: 2 }, { slug: "electrolytes", qty: 1 }], { mode: "address", area: "Canggu" });
  assert.equal(q.calloutIdr, canggu.calloutIdr);
  assert.equal(q.deliveryIdr, 0);
  assert.equal(q.hasSession, true);
  assert.equal(q.needsHealth, true);
  assert.equal(q.hasRx, false);
});

test("peptides need a doctor's review and a health questionnaire", () => {
  const q = quote([{ slug: "bpc-157", qty: 1 }], { mode: "address", area: "Canggu" });
  assert.equal(q.hasRx, true);
  assert.equal(q.needsHealth, true);
  assert.equal(q.hasSession, false);
});

test("a membership alone needs no delivery, questionnaire or fees", () => {
  const q = quote([{ slug: "member-essentials", qty: 1 }], { mode: "address", area: "Ubud" });
  assert.equal(q.needsFulfilment, false);
  assert.equal(q.needsHealth, false);
  assert.equal(q.totalIdr, price("member-essentials"));
});

test("unknown products are reported, duplicates merged and capped", () => {
  const q = quote([{ slug: "nope", qty: 1 }, { slug: "creatine", qty: 6 }, { slug: "creatine", qty: 6 }]);
  assert.deepEqual(q.unknown, ["nope"]);
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].qty, 10);
});

test("an unknown area charges nothing extra (the server refuses it separately)", () => {
  const q = quote([{ slug: "creatine", qty: 1 }], { mode: "address", area: "Atlantis" });
  assert.equal(q.deliveryIdr, 0);
});

test("totals are recomputed when the doctor removes a line", () => {
  const q = quote([{ slug: "bpc-157", qty: 1 }, { slug: "ghk-cu", qty: 1 }], { mode: "address", area: "Canggu" });
  const kept = q.lines.filter((l) => l.slug === "bpc-157");
  const fees = feesFor(kept, { mode: "address", area: "Canggu" });
  assert.equal(fees.subtotalIdr, price("bpc-157"));
  assert.equal(fees.totalIdr, price("bpc-157") + canggu.deliveryIdr);
});

test("age is counted in whole years up to the birthday", () => {
  assert.equal(ageOn("2008-11-19", "2026-11-18"), 17);
  assert.equal(ageOn("2008-11-18", "2026-11-18"), 18);
  assert.equal(ageOn("1990-05-20", "2026-11-18"), 36);
});

test("every area belongs to exactly one zone", () => {
  const all = ZONES.flatMap((z) => z.areas);
  assert.equal(new Set(all).size, all.length);
});

test("every product has its wording in English, and every prescription item is flagged", () => {
  const items = en.Catalog.items as Record<string, Record<string, string>>;
  for (const p of PRODUCTS) {
    for (const key of ["name", "tagline", "description", "contents", "unit"]) assert.ok(items[p.slug]?.[key], `${p.slug}.${key} missing in en.json`);
    if (p.kind === "peptide") assert.equal(p.rx, true, `${p.slug} must require a doctor's review`);
  }
  assert.deepEqual(Object.keys(items).sort(), PRODUCTS.map((p) => p.slug).sort());
});

test("Russian and French have exactly the same keys as English", () => {
  const flat = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k)) : [prefix];
  const base = flat(en).sort();
  assert.deepEqual(flat(ru).sort(), base);
  assert.deepEqual(flat(fr).sort(), base);
});
