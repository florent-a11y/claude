"use client";
import { DEAL_STAGES, DEAL_STAGE_LABELS, type DealStage } from "@/lib/types";
import { useApi } from "@/components/client";

const OPEN: DealStage[] = ["prospect", "qualified", "quotation_sent", "review", "invoice_sent"];

/** Prev/next stage arrows plus won/lost shortcuts; posts to the JSON route and refreshes the server-rendered board. */
export function StageMover({ id, stage, compact = true }: { id: string; stage: DealStage; compact?: boolean }) {
  const { call, busy, error } = useApi();
  const i = OPEN.indexOf(stage);
  const closed = i < 0;
  const move = async (next: DealStage) => {
    let lostReason: string | undefined;
    if (next === "closed_lost") {
      const r = prompt("Lost reason (price, timing, competitor, no answer…)");
      if (r === null) return;
      lostReason = r || undefined;
    }
    await call(`/api/crm/deals/${id}/stage`, { stage: next, lostReason });
  };
  const btn = `rounded px-1.5 py-0.5 text-xs ring-1 ring-slate-200 hover:bg-brand-50 disabled:opacity-40 ${compact ? "" : "px-2 py-1"}`;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!closed && <button type="button" className={btn} disabled={busy || i === 0} onClick={() => move(OPEN[i - 1])} title={i > 0 ? `Back to ${DEAL_STAGE_LABELS[OPEN[i - 1]]}` : ""}>←</button>}
      {!closed && <button type="button" className={btn} disabled={busy || i === OPEN.length - 1} onClick={() => move(OPEN[i + 1])} title={i < OPEN.length - 1 ? `Move to ${DEAL_STAGE_LABELS[OPEN[i + 1]]}` : ""}>→</button>}
      {!closed && <button type="button" className={`${btn} text-green-800`} disabled={busy} onClick={() => move("closed_won")}>Won</button>}
      {!closed && <button type="button" className={`${btn} text-red-700`} disabled={busy} onClick={() => move("closed_lost")}>Lost</button>}
      {closed && <button type="button" className={btn} disabled={busy} onClick={() => move("review")}>Reopen</button>}
      {!compact && (
        <select className="input !w-auto !py-1 text-xs" value={stage} disabled={busy} onChange={(e) => move(e.target.value as DealStage)}>
          {DEAL_STAGES.map((s) => <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>)}
        </select>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
