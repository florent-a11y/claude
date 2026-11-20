import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BankAccount, BankTransaction } from "../lib/types";

// Correcting a bank account's details. The currency can change only while the account holds no statement line.
// File backend in a temp folder (lib/db.ts reads ILA_DATA_DIR when it is first loaded); invented accounts.

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-bank-accounts-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let D: typeof import("../lib/db");
let A: typeof import("../lib/bank-accounts");
before(async () => {
  D = await import("../lib/db");
  A = await import("../lib/bank-accounts");
});
after(() => rmSync(DIR, { recursive: true, force: true }));

const ENTITY = "ent-bank";
const bank = (id: string, name: string, currency: string): BankAccount => ({ id, entityId: ENTITY, accountId: `gl-${id}`, name, currency, active: true });

test("an account saved with the wrong currency is corrected while it has no statement line", async () => {
  await D.db.insert("bank_accounts", bank("b1", "Bank Contoh USD", "IDR"));
  const fixed = await A.updateBankAccountDetails(ENTITY, "b1", { currency: "usd" });
  assert.equal(fixed.currency, "USD");
  assert.equal((await D.db.get("bank_accounts", "b1"))!.currency, "USD");
  // Name, bank and number are free to change; an empty bank or number is cleared.
  const renamed = await A.updateBankAccountDetails(ENTITY, "b1", { name: " Bank Contoh USD giro ", bankName: "Bank Contoh", accountNumber: "" });
  assert.deepEqual([renamed.name, renamed.bankName, renamed.accountNumber, renamed.currency], ["Bank Contoh USD giro", "Bank Contoh", undefined, "USD"]);
  await assert.rejects(() => A.updateBankAccountDetails(ENTITY, "b1", { name: "  " }), /needs a name/);
  await assert.rejects(() => A.updateBankAccountDetails(ENTITY, "b1", { currency: "dollars" }), /three-letter code/);
  await assert.rejects(() => A.updateBankAccountDetails("another-entity", "b1", { name: "x" }), /not found/);
});

test("the currency is fixed once statement lines are stored, the other details are not", async () => {
  await D.db.insert("bank_accounts", bank("b2", "Bank Contoh IDR", "IDR"));
  const line: BankTransaction = { id: "t1", entityId: ENTITY, bankAccountId: "b2", date: "2026-10-02", description: "SETORAN CONTOH", amount: 1_250_000.5, hash: "h1", status: "unmatched", createdAt: "2026-11-01T00:00:00.000Z" };
  await D.db.insert("bank_transactions", line);
  await assert.rejects(() => A.updateBankAccountDetails(ENTITY, "b2", { currency: "USD" }), /already holds 1 statement line in IDR/);
  assert.equal((await D.db.get("bank_accounts", "b2"))!.currency, "IDR");
  // Saving the form with the same currency changes nothing and is not an error.
  const same = await A.updateBankAccountDetails(ENTITY, "b2", { name: "Bank Contoh IDR operasional", currency: "IDR" });
  assert.deepEqual([same.name, same.currency], ["Bank Contoh IDR operasional", "IDR"]);
});
