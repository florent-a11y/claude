/**
 * Store side of the take-on (rules and vocabulary in lib/asset-takeon.ts): the fixed assets the ledger already
 * carries are brought into the register through the ordinary `createAsset`, so validation and the audit trail stay
 * in one place. Nothing is posted: the ledger is the starting point, the register is made to describe it.
 *
 * - `takeOnPreview` is what the Assets page shows: accounts whose cost is not in the register, the accounts kept
 *   outside it, and ledger against register for cost and accumulated depreciation.
 * - `takeOnAssets` creates the assets, flagged for review, and remembers the accounts left out. Called from the
 *   Assets page ("Bring into the register") and at the end of a QuickBooks migration (lib/qbo-migration-services.ts).
 *   Idempotent: once the assets are in the register the ledger has nothing more to offer.
 */
import { db } from "./db";
import { BooksError, createAsset, entityAccounts, errorMessage, loadEntity } from "./books";
import { postedEntries } from "./posting";
import { takeOnPlan, type TakeOnChoice, type TakeOnDraft, type TakeOnInput, type TakeOnPlan } from "./asset-takeon";
import type { Entity, FixedAsset } from "./types";

async function load(entityId: string): Promise<{ entity: Entity; input: TakeOnInput }> {
  const [entity, accounts, entries, assets] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), postedEntries(entityId), db.list("fixed_assets", { where: { entityId } })]);
  if (!entity) throw new BooksError("Entity not found.");
  return { entity, input: { accounts, entries, assets, outside: entity.assetAccountsOutsideRegister ?? [] } };
}

/** The plan for the Assets page, with the default mode of every account. */
export async function takeOnPreview(entityId: string): Promise<TakeOnPlan> {
  return takeOnPlan((await load(entityId)).input);
}

export interface TakeOnOutcome {
  created: FixedAsset[];
  /** Accounts for which nothing (or not everything) was created, with the reason. */
  problems: Array<{ accountId: string; account: string; message: string }>;
  /** Cost accounts this call left out of the register. */
  leftOut: string[];
}

/**
 * Brings the ledger's fixed assets into the register. `choices` (by cost account id): "line" = one asset per purchase
 * line, "account" = one asset for the account, "skip" = leave the account out of the register, remembered on the
 * entity (`assetAccountsOutsideRegister`) until it is brought back with `setAssetAccountOutside`. An account without
 * a choice takes its default mode. Every asset is created waiting for review, with the accumulated depreciation and
 * the last month the previous books posted (`takeOn`); `runDepreciation` leaves it alone until it is confirmed. A
 * problem with one account is reported and never stops the others. A second call creates nothing.
 */
export async function takeOnAssets(entityId: string, choices: Readonly<Record<string, TakeOnChoice | undefined>> = {}, userId?: string): Promise<TakeOnOutcome> {
  const { entity, input } = await load(entityId);
  const outcome: TakeOnOutcome = { created: [], problems: [], leftOut: [] };
  const label = (accountId: string) => { const a = input.accounts.find((x) => x.id === accountId); return a ? `${a.code} ${a.name}` : accountId; };

  const outside = new Set(entity.assetAccountsOutsideRegister ?? []);
  for (const [accountId, choice] of Object.entries(choices)) {
    if (choice !== "skip" || outside.has(accountId) || !input.accounts.some((a) => a.id === accountId && a.subtype === "fixed_asset")) continue;
    outside.add(accountId);
    outcome.leftOut.push(accountId);
  }
  if (outcome.leftOut.length) await db.update("entities", entityId, { assetAccountsOutsideRegister: [...outside], updatedAt: new Date().toISOString() });

  const plan = takeOnPlan({ ...input, outside: [...outside] }, choices);
  for (const p of plan.problems) outcome.problems.push({ accountId: p.accountId, account: label(p.accountId), message: p.message });
  const byAccount = new Map<string, TakeOnDraft[]>();
  for (const d of plan.drafts) byAccount.set(d.assetAccountId, [...(byAccount.get(d.assetAccountId) ?? []), d]);
  for (const [accountId, drafts] of byAccount) {
    try {
      for (const d of drafts) outcome.created.push(await createAsset(entityId, { ...d, needsReview: true, takeOn: { ...d.takeOn, byUserId: userId } }));
    } catch (e) {
      const message = errorMessage(e);
      outcome.problems.push({ accountId, account: label(accountId), message });
      console.error(`[asset-takeon] ${label(accountId)}: ${message}`);
    }
  }
  return outcome;
}

/** Keeps a cost account outside the register (`outside` true), or brings it back so the Assets page offers it again. */
export async function setAssetAccountOutside(entityId: string, accountId: string, outside: boolean): Promise<void> {
  const [entity, accounts] = await Promise.all([loadEntity(entityId), entityAccounts(entityId)]);
  if (!entity) throw new BooksError("Entity not found.");
  const list = new Set(entity.assetAccountsOutsideRegister ?? []);
  if (outside) {
    if (!accounts.some((a) => a.id === accountId && a.subtype === "fixed_asset")) throw new BooksError("Only a fixed-asset (cost) account can be left out of the register.");
    list.add(accountId);
  } else list.delete(accountId);
  await db.update("entities", entityId, { assetAccountsOutsideRegister: [...list], updatedAt: new Date().toISOString() });
}
