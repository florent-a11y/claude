import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_BANK, NEW_GL, SWITCH_PREFIX, canChangeBankCurrency, nextBankGlCode, planSections, suggestBankName, suggestGlAccount, type SectionBank } from "../lib/bank-sections";

// One statement, several currencies: where each section goes by default. Invented accounts only.

const idr: SectionBank = { id: "b-idr", name: "Bank Contoh IDR", currency: "IDR", active: true };
const usd: SectionBank = { id: "b-usd", name: "Bank Contoh USD", currency: "USD", active: true };
const usd2: SectionBank = { id: "b-usd2", name: "Bank Lain USD", currency: "USD", active: true };
const closed: SectionBank = { id: "b-eur-old", name: "Bank Contoh EUR (closed)", currency: "EUR", active: false };

test("each currency section goes to the account kept in that currency", () => {
  const plan = planSections({ USD: 3, IDR: 5 }, [idr, usd], idr);
  assert.deepEqual(plan.map((s) => [s.currency, s.lines, s.target]), [["IDR", 5, "b-idr"], ["USD", 3, "b-usd"]], "the opened account's currency first");
  assert.deepEqual(plan[1].candidates.map((b) => b.id), ["b-usd"]);
});

test("a currency without a bank account gets one created; several accounts leave the choice to the user", () => {
  const none = planSections({ IDR: 5, USD: 3, EUR: 1 }, [idr, closed], idr);
  assert.deepEqual(none.map((s) => [s.currency, s.target]), [["IDR", "b-idr"], ["USD", NEW_BANK], ["EUR", NEW_BANK]], "an inactive account is not a destination");
  const several = planSections({ IDR: 5, USD: 3 }, [idr, usd, usd2], idr);
  assert.equal(several[1].target, "", "two USD accounts: the user chooses");
  assert.deepEqual(several[1].candidates.map((b) => b.id), ["b-usd", "b-usd2"]);
});

test("the opened account always takes its own currency, even among several, and a foreign-only statement is routed too", () => {
  const two = planSections({ IDR: 4 }, [idr, { id: "b-idr2", name: "Bank Lain IDR", currency: "IDR", active: true }], idr);
  assert.equal(two[0].target, "b-idr");
  // A USD-only statement opened from the IDR account: the lines go to the USD account, not to the one on screen.
  const foreign = planSections({ usd: 7 }, [idr, usd], idr);
  assert.deepEqual(foreign.map((s) => [s.currency, s.target]), [["USD", "b-usd"]]);
  assert.deepEqual(planSections({ USD: 0 }, [idr], idr), [], "a section without lines is not listed");
  assert.deepEqual(planSections({}, [idr], idr), []);
  // The opened account is offered for its currency even when the list given does not carry it.
  assert.deepEqual(planSections({ IDR: 1 }, [], idr)[0].candidates.map((b) => b.id), ["b-idr"]);
});

test("names and GL accounts suggested for an account created from the import", () => {
  assert.equal(suggestBankName("Bank Contoh IDR", "IDR", "USD"), "Bank Contoh USD");
  assert.equal(suggestBankName("Bank Contoh idr operating", "IDR", "USD"), "Bank Contoh USD operating");
  assert.equal(suggestBankName("Bank Contoh giro", "IDR", "USD"), "Bank Contoh giro USD", "no currency in the name: it is appended");
  const options = [{ id: "g1", code: "1-1110", name: "Bank USD" }, { id: "g2", code: "1-1000", name: "Cash on hand" }, { id: NEW_GL, code: "NEW", name: "Create a new GL account" }];
  assert.equal(suggestGlAccount(options, "USD"), "g1");
  assert.equal(suggestGlAccount(options, "EUR"), NEW_GL, "nothing names the currency: a new GL account");
  assert.equal(suggestGlAccount([{ id: "g3", code: "1-1130", name: "Bank Contoh USD giro" }], "usd"), "g3");
});

test("code of the GL account created with a bank account: ten after the highest bank code, never one in use", () => {
  const chart = [{ code: "1-1000", subtype: "cash" }, { code: "1-1100", subtype: "bank" }, { code: "1-1110", subtype: "bank" }, { code: "1-1200", subtype: "ar" }];
  assert.equal(nextBankGlCode(chart), "1-1120");
  assert.equal(nextBankGlCode([...chart, { code: "1-1120", subtype: "other_receivable" }]), "1-1121", "a code taken by any account is skipped");
  assert.equal(nextBankGlCode([{ code: "1-1200", subtype: "ar" }]), "1-1100", "a chart without bank accounts");
  assert.equal(nextBankGlCode([{ code: "1-1100", subtype: "cash" }]), "1-1101");
});

test("an account named for the currency but saved in another one is offered, and switched when it is the only fit", () => {
  // The form's default currency is IDR: "Bank Contoh USD" was saved as an IDR account and has no statement line yet.
  const misnamed: SectionBank = { id: "b-x", name: "Bank Contoh USD", currency: "IDR", active: true, lines: 0 };
  const plan = planSections({ IDR: 5, USD: 3 }, [idr, misnamed], idr);
  assert.deepEqual(plan[1].convertible.map((b) => b.id), ["b-x"]);
  assert.equal(plan[1].target, `${SWITCH_PREFIX}b-x`, "no USD account: the misnamed one is switched");
  assert.deepEqual(plan[0].convertible, [], "nothing to switch for the opened account's own currency");
  // With a real USD account the lines go there; the misnamed one stays an option.
  const both = planSections({ USD: 3 }, [idr, usd, misnamed], idr);
  assert.equal(both[0].target, "b-usd");
  assert.deepEqual(both[0].convertible.map((b) => b.id), ["b-x"]);
  // An account that already holds statement lines, or whose lines were not counted, is never switched.
  assert.deepEqual(planSections({ USD: 3 }, [idr, { ...misnamed, lines: 4 }], idr)[0].target, NEW_BANK);
  assert.deepEqual(planSections({ USD: 3 }, [idr, { ...misnamed, lines: undefined }], idr)[0].convertible, []);
  // The name must carry the code as a word; the opened account is never switched away from its own currency.
  assert.deepEqual(planSections({ USD: 3 }, [idr, { id: "b-y", name: "Bank Contoh dana", currency: "IDR", active: true, lines: 0 }], idr)[0].target, NEW_BANK);
  assert.deepEqual(planSections({ USD: 3 }, [{ ...idr, name: "Bank Contoh USD", lines: 0 }], { ...idr, name: "Bank Contoh USD", lines: 0 })[0].convertible, []);
  // Two misnamed accounts: the user chooses.
  assert.equal(planSections({ USD: 3 }, [idr, misnamed, { ...misnamed, id: "b-z", name: "Bank Lain USD" }], idr)[0].target, "");
  assert.equal(canChangeBankCurrency(0), true);
  assert.equal(canChangeBankCurrency(1), false);
  assert.equal(canChangeBankCurrency(undefined), false);
});
