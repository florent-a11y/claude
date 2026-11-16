import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BankAccount, BankTransaction } from "../lib/types";

/**
 * Re-importing a statement that an earlier version already stored: its lines had shorter descriptions and whole-rupiah
 * amounts, so the description hash no longer matches. The running balance tells the same line apart; nothing is
 * stored twice, and an unmatched line gets its cents back. Synthetic data only, on the file backend in a temp folder
 * (lib/db.ts reads ILA_DATA_DIR when it is first loaded).
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-bank-reimport-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let D: typeof import("../lib/db");
let B: typeof import("../lib/books");
before(async () => {
  D = await import("../lib/db");
  B = await import("../lib/books");
});
after(() => rmSync(DIR, { recursive: true, force: true }));

const ENTITY = "ent-reimport";
const bank: BankAccount = { id: "bank-1", entityId: ENTITY, accountId: "gl-bank", name: "Bank Contoh IDR", currency: "IDR", active: true };
const statement = [
  { date: "2026-10-02", description: "SETORAN KLIRING/CLEARING DEPOSIT PT CONTOH KLIEN/INV 0042", amount: 12_500_000.5, balance: 262_500_001.25 },
  { date: "2026-10-05", description: "Pembayaran Tagihan Listrik Perusahaan/Company Power Bill Payment Berita : PLN DEMO", amount: -1_250_000.25, balance: 261_250_001 },
  { date: "2026-10-25", description: "BUNGA GIRO/CURRENT ACCOUNT INTEREST", amount: 150_400.33, balance: 261_400_401.33 },
  { date: "2026-10-25", description: "PAJAK BUNGA/INTEREST TAX", amount: -30_080.07, balance: 261_370_321.26 },
];

test("a statement imported again is not stored twice, and unmatched lines get their cents back", async () => {
  await D.db.insert("bank_accounts", bank);
  // What the earlier version stored for the first three lines: truncated descriptions, whole rupiah, exact balances.
  const old = (i: number, description: string, extra: Partial<BankTransaction> = {}): BankTransaction => ({
    id: `old-${i}`, entityId: ENTITY, bankAccountId: bank.id, date: statement[i].date, description, amount: Math.round(statement[i].amount), balance: statement[i].balance,
    hash: B.bankTransactionHash(bank.id, { date: statement[i].date, amount: statement[i].amount, description }), status: "unmatched", createdAt: "2026-11-01T00:00:00.000Z", ...extra,
  });
  await D.db.insertMany("bank_transactions", [
    old(0, "SETORAN KLIRING/CLEARING DEPOSIT"),
    old(1, "Pembayaran Tagihan Listrik", { status: "matched", matchedJournalId: "je-1" }),
    // Same description as today: recognised by its hash, and corrected too.
    old(2, statement[2].description),
  ]);

  const batch = await B.importBankCsv(ENTITY, { bankAccountId: bank.id, fileName: "statement-demo.pdf", rows: statement });
  assert.equal(batch.inserted, 1, "only the line that was missing is added");
  assert.equal(batch.skipped, 3);
  assert.equal(batch.updated, 2, "the two unmatched lines get the exact amount");

  const stored = await D.db.list("bank_transactions", { where: { entityId: ENTITY, bankAccountId: bank.id } });
  assert.equal(stored.length, 4);
  const byId = new Map(stored.map((t) => [t.id, t]));
  assert.equal(byId.get("old-0")!.amount, 12_500_000.5);
  assert.equal(byId.get("old-0")!.description, "SETORAN KLIRING/CLEARING DEPOSIT", "the stored description is kept");
  assert.equal(byId.get("old-1")!.amount, -1_250_000, "a matched line stays as it was booked");
  assert.equal(byId.get("old-2")!.amount, 150_400.33);
  const added = stored.find((t) => !t.id.startsWith("old-"))!;
  assert.deepEqual([added.date, added.amount, added.balance], ["2026-10-25", -30_080.07, 261_370_321.26]);

  // A third import changes nothing.
  const again = await B.importBankCsv(ENTITY, { bankAccountId: bank.id, fileName: "statement-demo.pdf", rows: statement });
  assert.deepEqual([again.inserted, again.skipped, again.updated ?? 0], [0, 4, 0]);
  assert.equal((await D.db.list("bank_transactions", { where: { entityId: ENTITY } })).length, 4);
});

test("two different lines of the same day are both stored, even with the same amount", async () => {
  const rows = [
    { date: "2026-11-03", description: "BIAYA ADMIN/ADMIN FEE", amount: -15_000, balance: 261_355_321.26 },
    { date: "2026-11-03", description: "BIAYA ADMIN/ADMIN FEE", amount: -15_000, balance: 261_340_321.26 },
  ];
  const batch = await B.importBankCsv(ENTITY, { bankAccountId: bank.id, fileName: "nov.pdf", rows });
  assert.deepEqual([batch.inserted, batch.skipped], [2, 0]);
  const again = await B.importBankCsv(ENTITY, { bankAccountId: bank.id, fileName: "nov.pdf", rows });
  assert.deepEqual([again.inserted, again.skipped], [0, 2]);
});
