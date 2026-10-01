import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteTotals, normaliseLines, servicePrice, defaultValidUntil, effectiveQuoteStatus, inferCategoryFromLines,
  checklistTemplate, checklistTemplateKey, checklistProgress,
  inferRenewalKind, renewalFromProject, projectsNeedingRenewal, expiryUrgency, inferExpiry,
  pipelineStats, stageAfterQuote, dealAgeDays, matchesSearch, projectCostSummary, sortTasks, isOverdue,
} from "../lib/crm";
import type { Deal, Project } from "../lib/types";

test("quote totals: positive lines, discount lines and quote-level discount", () => {
  const lines = [
    { qty: 1, unitPrice: 43_000_000 }, // working KITAS
    { qty: 2, unitPrice: 3_000_000 }, // 2 bridging visas
    { qty: 1, unitPrice: -2_000_000 }, // discount line
  ];
  const t = quoteTotals(lines, "IDR", 1_000_000);
  assert.equal(t.subtotal, 49_000_000);
  assert.equal(t.discount, 3_000_000);
  assert.equal(t.total, 46_000_000);
  // never negative, rounds to the currency precision
  assert.equal(quoteTotals([{ qty: 1, unitPrice: 100 }], "USD", 500).total, 0);
  assert.deepEqual(quoteTotals([{ qty: 3, unitPrice: 33.333 }], "USD"), { subtotal: 100, discount: 0, total: 100 });
  const n = normaliseLines([{ id: "a", description: "x", qty: 2, unitPrice: 955 }], "EUR");
  assert.equal(n[0].amount, 1910);
});

test("catalogue prices follow the quote currency and default validity is 7 days", () => {
  const item = { priceIDR: 19_500_000, priceUSD: 1100, priceEUR: 955 };
  assert.equal(servicePrice(item, "IDR"), 19_500_000);
  assert.equal(servicePrice(item, "USD"), 1100);
  assert.equal(servicePrice(item, "EUR"), 955);
  assert.equal(servicePrice({ priceIDR: 5_000_000 }, "USD"), 0);
  assert.equal(defaultValidUntil("2026-10-01"), "2026-10-08");
  assert.equal(effectiveQuoteStatus({ status: "sent", validUntil: "2026-09-30" }, "2026-10-01"), "expired");
  assert.equal(effectiveQuoteStatus({ status: "sent", validUntil: "2026-10-01" }, "2026-10-01"), "sent");
  assert.equal(effectiveQuoteStatus({ status: "accepted", validUntil: "2026-01-01" }, "2026-10-01"), "accepted");
});

test("quote category is inferred from the heaviest catalogue line, ignoring disbursements", () => {
  const services = new Map([["s1", { category: "visa" as const }], ["s2", { category: "corporate" as const }], ["s3", { category: "disbursement" as const }]]);
  assert.equal(inferCategoryFromLines([{ serviceId: "s1", amount: 1 }, { serviceId: "s2", amount: 100 }, { serviceId: "s3", amount: 1000 }], services), "corporate");
  assert.equal(inferCategoryFromLines([{ serviceId: undefined, amount: 100 }], services), undefined);
});

test("checklist templates resolve by service code first, then by category", () => {
  assert.equal(checklistTemplateKey("visa", "VISA-WK"), "working_kitas");
  assert.equal(checklistTemplateKey("visa", "VISA-WK-RENEW"), "working_kitas");
  assert.equal(checklistTemplateKey("visa", "VISA-INV-EXT"), "investor_kitas");
  assert.equal(checklistTemplateKey("corporate", "CORP-PMA-LOMBOK"), "incorporation");
  assert.equal(checklistTemplateKey("legal_property", "LEG-DD"), "due_diligence");
  assert.equal(checklistTemplateKey("licensing", "LIC-PBG"), "pbg");
  assert.equal(checklistTemplateKey("tax_accounting"), "tax_accounting");
  assert.equal(checklistTemplateKey("corporate", "CORP-UNKNOWN"), "corporate");
  const wk = checklistTemplate("visa", "VISA-WK");
  assert.ok(wk.some((l) => /RPTKA/.test(l)));
  assert.ok(wk.some((l) => /IMTA.*1,200/.test(l)));
  assert.ok(wk.some((l) => /Biometrics at Kanim/.test(l)));
  assert.ok(wk.some((l) => /KITAS issued/.test(l)));
  const inc = checklistTemplate("corporate", "CORP-PMA");
  for (const must of ["Name reservation", "Deed signing", "SK Kemenkumham", "NPWP", "NIB", "Bank account"]) assert.ok(inc.some((l) => l.includes(must)), must);
  const dd = checklistTemplate("legal_property", "LEG-DD");
  for (const must of ["BPN", "Zoning", "Site visit", "Report"]) assert.ok(dd.some((l) => l.includes(must)), must);
  // template is a copy: mutating it must not leak
  wk.push("x");
  assert.ok(!checklistTemplate("visa", "VISA-WK").includes("x"));
  assert.deepEqual(checklistProgress([{ done: true }, { done: false }, { done: true }]), { done: 2, total: 3, pct: 67 });
});

test("renewal kind is inferred from the service code, then the category", () => {
  assert.equal(inferRenewalKind("visa", "VISA-INV"), "kitas");
  assert.equal(inferRenewalKind("visa", "VISA-WK-RENEW"), "kitas");
  assert.equal(inferRenewalKind("visa", "VISA-D2"), "visa");
  assert.equal(inferRenewalKind("visa", "VISA-PASSPORT"), "passport");
  assert.equal(inferRenewalKind("visa"), "kitas");
  assert.equal(inferRenewalKind("corporate", "CORP-VO"), "commercial_address");
  assert.equal(inferRenewalKind("corporate", "CORP-DIR"), "resident_director");
  assert.equal(inferRenewalKind("corporate", "CORP-COMM"), "commissioner");
  assert.equal(inferRenewalKind("corporate", "CORP-SH"), "local_shareholder");
  assert.equal(inferRenewalKind("corporate", "CORP-SHA"), "other");
  assert.equal(inferRenewalKind("corporate", "CORP-GMS"), "gms");
  assert.equal(inferRenewalKind("tax_accounting", "TAX-LKPM"), "lkpm");
  assert.equal(inferRenewalKind("licensing", "LIC-PBG"), "licence");
  assert.equal(inferRenewalKind("licensing"), "licence");
  assert.equal(inferRenewalKind("advisory"), "other");
});

const baseProject: Project = {
  id: "p1", number: "P-2026-0001", title: "Investor KITAS - Camille", category: "visa", serviceId: "s1", companyId: "c1", contactId: "k1", status: "done",
  ownerUserId: "u1", subject: { name: "Camille Durand" }, feeAmount: 19_500_000, feeCurrency: "IDR", checklist: [], costOfSales: [], expiresAt: "2028-10-01", createdAt: "2026-10-01T00:00:00Z",
};

test("a completed project with an expiry produces a renewal; without one it does not", () => {
  const r = renewalFromProject(baseProject, { id: "r1", now: "2026-10-01T00:00:00Z", serviceCode: "VISA-INV" });
  assert.ok(r);
  assert.equal(r.kind, "kitas");
  assert.equal(r.label, "KITAS / stay permit - Camille Durand");
  assert.equal(r.expiresAt, "2028-10-01");
  assert.equal(r.reminderDays, 60);
  assert.equal(r.projectId, "p1");
  assert.equal(r.companyId, "c1");
  assert.equal(r.status, "upcoming");
  assert.equal(renewalFromProject({ ...baseProject, expiresAt: undefined }, { id: "r2", now: "x" }), null);
  assert.equal(inferExpiry({ expiresAt: undefined, completedAt: "2026-10-01T05:00:00Z" }, { renewalMonths: 24 }), "2028-10-01");
  assert.equal(inferExpiry({ expiresAt: "2027-01-01", completedAt: undefined }, { renewalMonths: 24 }), "2027-01-01");
  assert.equal(inferExpiry({ expiresAt: undefined, completedAt: undefined }, { renewalMonths: 24 }), undefined);
});

test("generate-from-projects only picks done projects with expiry and no renewal yet", () => {
  const p2: Project = { ...baseProject, id: "p2" };
  const p3: Project = { ...baseProject, id: "p3", status: "in_progress" };
  const p4: Project = { ...baseProject, id: "p4", expiresAt: undefined };
  const out = projectsNeedingRenewal([baseProject, p2, p3, p4], [{ projectId: "p1" }]);
  assert.deepEqual(out.map((p) => p.id), ["p2"]);
  assert.equal(expiryUrgency(-5), "red");
  assert.equal(expiryUrgency(30), "red");
  assert.equal(expiryUrgency(31), "amber");
  assert.equal(expiryUrgency(60), "amber");
  assert.equal(expiryUrgency(61), "green");
});

test("pipeline weighted value follows DEAL_STAGE_PROBABILITY per currency, with optional FX fold", () => {
  const mk = (stage: Deal["stage"], amount: number, currency = "IDR"): Deal => ({ id: Math.random().toString(), title: "d", stage, amount, currency, createdAt: "2026-09-01T00:00:00Z", closedAt: stage.startsWith("closed") ? "2026-09-20T00:00:00Z" : undefined });
  const deals = [mk("prospect", 10_000_000), mk("qualified", 10_000_000), mk("quotation_sent", 10_000_000), mk("review", 1000, "USD"), mk("closed_won", 50_000_000), mk("closed_lost", 5_000_000)];
  const s = pipelineStats(deals, { year: 2026 });
  assert.equal(s.open.count, 4);
  assert.equal(s.open.amount.IDR, 30_000_000);
  assert.equal(s.open.amount.USD, 1000);
  assert.equal(s.open.weighted.IDR, 2_000_000 + 4_000_000 + 6_000_000);
  assert.equal(s.open.weighted.USD, 800);
  assert.equal(s.stages.closed_won.weighted.IDR, 50_000_000);
  assert.equal(s.stages.closed_lost.weighted.IDR, 0);
  assert.equal(s.wonThisYear.amount.IDR, 50_000_000);
  const folded = pipelineStats(deals, { fx: { USD: 16_000 } });
  assert.equal(folded.open.amount.IDR, 46_000_000);
  assert.equal(folded.open.amount.USD, undefined);
  assert.equal(folded.open.weighted.IDR, 12_000_000 + 12_800_000);
  assert.equal(stageAfterQuote("prospect", "sent"), "quotation_sent");
  assert.equal(stageAfterQuote("review", "sent"), "review");
  assert.equal(stageAfterQuote("quotation_sent", "accepted"), "review");
  assert.equal(stageAfterQuote("closed_lost", "accepted"), "closed_lost");
  assert.equal(dealAgeDays({ createdAt: "2026-09-01T10:00:00Z" }, "2026-10-01T00:00:00Z"), 30);
  assert.equal(dealAgeDays({ createdAt: "2026-09-01T10:00:00Z", closedAt: "2026-09-11T00:00:00Z" }, "2026-10-01T00:00:00Z"), 10);
});

test("search matches every token across fields, ignoring case and accents", () => {
  const fields = ["Camille Durand", "camille@example.com", "+33 6 00 00 00 00", "FR", "PT Demo Villa Investama"];
  assert.ok(matchesSearch(fields, "camille villa"));
  assert.ok(matchesSearch(fields, "DURAND"));
  assert.ok(matchesSearch(fields, "Camillé"));
  assert.ok(!matchesSearch(fields, "camille lombok"));
  assert.ok(matchesSearch(fields, ""));
  assert.ok(matchesSearch(fields, undefined));
});

test("cost of sales summary gives totals, pending approvals and margin in IDR", () => {
  const s = projectCostSummary({ feeAmount: 43_000_000, feeCurrency: "IDR", costOfSales: [
    { id: "a", description: "DKP-TKA", amountIDR: 19_800_000, amountUSD: 1200, approved: true },
    { id: "b", description: "Kanim agent", amountIDR: 2_000_000, approved: false },
  ] });
  assert.equal(s.costIDR, 21_800_000);
  assert.equal(s.approvedIDR, 19_800_000);
  assert.equal(s.pendingIDR, 2_000_000);
  assert.equal(s.costUSD, 1200);
  assert.equal(s.marginIDR, 21_200_000);
  assert.equal(s.marginPct, 49.3);
  assert.equal(projectCostSummary({ feeAmount: 1100, feeCurrency: "USD", costOfSales: [] }).marginIDR, null);
});

test("tasks: overdue first, then by due date, undated last", () => {
  const t = (id: string, dueDate: string | undefined, done = false) => ({ id, dueDate, done, createdAt: "2026-09-01T00:00:00Z" });
  const sorted = sortTasks([t("later", "2026-10-20"), t("undated", undefined), t("overdue", "2026-09-20"), t("done-overdue", "2026-09-01", true), t("soon", "2026-10-02")], "2026-10-01");
  assert.deepEqual(sorted.map((x) => x.id), ["overdue", "done-overdue", "soon", "later", "undated"]);
  assert.ok(isOverdue(t("x", "2026-09-30"), "2026-10-01"));
  assert.ok(!isOverdue(t("x", "2026-10-01"), "2026-10-01"));
});
