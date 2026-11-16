import { db } from "@/lib/db";
import type { FixedAsset } from "@/lib/types";
import { base } from "../shared";

/** Where an asset came from, as a link: the bill, the expense or the journal entry it was registered from. */
export interface AssetSource { label: string; href: string }

type Sourced = Pick<FixedAsset, "billId" | "paymentId" | "sourceJournalId">;

/**
 * Sources of several assets at once (the register): one read per table. A bill is named by its number, an expense
 * and a hand-written entry by their journal number; an asset registered by hand has no entry in the map. A bill id
 * typed on the registration form that matches no bill of the entity is ignored.
 */
export async function assetSources(entityId: string, assets: Array<Sourced & { id: string }>): Promise<Map<string, AssetSource>> {
  const [bills, journals] = await Promise.all([
    db.getMany("bills", assets.map((a) => a.billId ?? "")),
    db.getMany("journal_entries", assets.map((a) => a.sourceJournalId ?? "")),
  ]);
  const b = base(entityId);
  const out = new Map<string, AssetSource>();
  for (const a of assets) {
    const bill = a.billId ? bills.get(a.billId) : undefined;
    const journal = a.sourceJournalId ? journals.get(a.sourceJournalId) : undefined;
    if (bill && bill.entityId === entityId) out.set(a.id, { label: `Bill ${bill.number}`, href: `${b}/purchases/${bill.id}` });
    else if (a.paymentId) out.set(a.id, { label: `Expense${journal ? ` ${journal.number}` : ""}`, href: `${b}/expenses/${a.paymentId}` });
    else if (journal && journal.entityId === entityId) out.set(a.id, { label: `Journal ${journal.number}`, href: `${b}/journal/${journal.id}` });
  }
  return out;
}

export async function assetSource(entityId: string, asset: Sourced & { id: string }): Promise<AssetSource | undefined> {
  return (await assetSources(entityId, [asset])).get(asset.id);
}
