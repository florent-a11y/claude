import { db } from "./db";
import { BooksError } from "./books";
import { canChangeBankCurrency } from "./bank-sections";
import type { BankAccount } from "./types";

export interface BankAccountPatch { name?: string; bankName?: string; accountNumber?: string; currency?: string }

/**
 * Corrects the details of a bank or cash account: name, bank, account number and currency. The currency can only
 * change while the account has no statement line and no signed-off reconciliation (everything stored on it is in
 * that currency); the GL account is not changed here. Used by the "Edit details" form of the account and by the
 * statement import, which switches an account named for a currency ("… USD") but saved in another one.
 */
export async function updateBankAccountDetails(entityId: string, id: string, patch: BankAccountPatch): Promise<BankAccount> {
  const bank = await db.get("bank_accounts", id);
  if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
  const next: Partial<BankAccount> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new BooksError("The bank account needs a name.");
    next.name = name;
  }
  if (patch.bankName !== undefined) next.bankName = patch.bankName.trim() || undefined;
  if (patch.accountNumber !== undefined) next.accountNumber = patch.accountNumber.trim() || undefined;
  if (patch.currency !== undefined) {
    const currency = patch.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BooksError("Currency is a three-letter code (IDR, USD, EUR…).");
    if (currency !== bank.currency.toUpperCase()) {
      const lines = (await db.list("bank_transactions", { where: { entityId, bankAccountId: id } })).length;
      if (!canChangeBankCurrency(lines) || (bank.reconciliations?.length ?? 0) > 0) throw new BooksError(`This account already holds ${lines} statement line${lines === 1 ? "" : "s"} in ${bank.currency}: its currency can no longer be changed. Create a ${currency} bank account instead.`);
      next.currency = currency;
    }
  }
  if (Object.keys(next).length === 0) return bank;
  return (await db.update("bank_accounts", id, next))!;
}
