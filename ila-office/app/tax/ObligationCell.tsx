"use client";
import { useApi } from "@/components/client";
import { OBLIGATION_STATUSES, OBLIGATION_STATUS_LABELS, type ObligationStatus } from "@/lib/types";

const TONE: Record<ObligationStatus, string> = {
  not_started: "bg-slate-100 text-slate-700", data_requested: "bg-amber-100 text-amber-900", data_received: "bg-blue-100 text-blue-800", in_preparation: "bg-blue-100 text-blue-800",
  awaiting_approval: "bg-amber-100 text-amber-900", paid: "bg-green-100 text-green-800", reported: "bg-green-100 text-green-800", nil: "bg-slate-100 text-slate-500", late: "bg-red-100 text-red-800",
};

export type CellUser = { id: string; name: string };

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0] ?? "").join("").slice(0, 3).toUpperCase();
}

/** Inline status + assignee editor used in the calendar matrices. Posts to /api/tax/obligations/:id and refreshes. */
export function ObligationCell({ id, status, assigneeUserId, users, canWrite, overdue, hint }: {
  id: string; status: ObligationStatus; assigneeUserId?: string; users: CellUser[]; canWrite: boolean; overdue?: boolean; hint?: string;
}) {
  const { call, busy, error } = useApi();
  const url = `/api/tax/obligations/${encodeURIComponent(id)}`;
  return (
    <div className={`flex min-w-[7rem] flex-col gap-0.5 ${overdue ? "rounded-md ring-1 ring-red-400 p-0.5" : ""}`} title={hint}>
      <select
        aria-label="Status" value={status} disabled={!canWrite || busy}
        onChange={(e) => call(url, { status: e.target.value }, "PATCH")}
        className={`pill w-full cursor-pointer appearance-none border-0 pr-4 ${TONE[status]} ${busy ? "opacity-60" : ""}`}
      >
        {OBLIGATION_STATUSES.map((s) => <option key={s} value={s}>{OBLIGATION_STATUS_LABELS[s]}</option>)}
      </select>
      <select
        aria-label="Assignee" value={assigneeUserId ?? ""} disabled={!canWrite || busy}
        onChange={(e) => call(url, { assigneeUserId: e.target.value || null }, "PATCH")}
        className="w-full cursor-pointer appearance-none rounded border-0 bg-transparent px-1 text-[10px] text-ink-500"
      >
        <option value="">— unassigned —</option>
        {users.map((u) => <option key={u.id} value={u.id}>{initials(u.name)} · {u.name}</option>)}
      </select>
      {hint && <span className="px-1 text-[10px] text-ink-500">{hint}</span>}
      {error && <span className="px-1 text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
