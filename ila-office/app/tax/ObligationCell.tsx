"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useApi } from "@/components/client";
import { OBLIGATION_STATUSES, OBLIGATION_STATUS_LABELS, type ObligationStatus } from "@/lib/types";

const TONE: Record<ObligationStatus, string> = {
  not_started: "bg-slate-100 text-slate-700", data_requested: "bg-amber-100 text-amber-900", data_received: "bg-blue-100 text-blue-800", in_preparation: "bg-blue-100 text-blue-800",
  awaiting_approval: "bg-amber-100 text-amber-900", paid: "bg-green-100 text-green-800", reported: "bg-green-100 text-green-800", nil: "bg-slate-100 text-slate-500", late: "bg-red-100 text-red-800",
};
/** Display labels short enough for a 140px matrix cell; the dropdown and the tooltip keep the full labels. */
const SHORT_LABEL: Partial<Record<ObligationStatus, string>> = { awaiting_approval: "Awaiting approval" };

export type CellUser = { id: string; name: string };

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0] ?? "").join("").slice(0, 3).toUpperCase();
}

/**
 * Inline status + assignee editor used in the calendar matrices. Posts to /api/tax/obligations/:id and refreshes.
 * Two compact lines: the status pill, then a small grey line with `hint` and/or `children` (links, amounts) and the
 * assignee as initials. Both controls are native selects laid transparently over their label, so the cell stays one
 * line per item while the dropdowns keep the full texts. When nobody is assigned the assignee control only shows
 * (as "+") while the cell is hovered or focused. `docsHref` adds a small "docs" link to the obligation's detail page
 * (supporting documents), with the number of files already attached when there are any.
 */
export function ObligationCell({ id, status, assigneeUserId, users, canWrite, overdue, hint, title, docsHref, docsCount = 0, children }: {
  id: string; status: ObligationStatus; assigneeUserId?: string; users: CellUser[]; canWrite: boolean; overdue?: boolean; hint?: string; title?: string; docsHref?: string; docsCount?: number; children?: ReactNode;
}) {
  const { call, busy, error } = useApi();
  const url = `/api/tax/obligations/${encodeURIComponent(id)}`;
  const assignee = users.find((u) => u.id === assigneeUserId);
  const disabled = !canWrite || busy;
  const overlay = "absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default";
  const assigneeSelect = (
    <select aria-label="Assignee" value={assigneeUserId ?? ""} disabled={disabled} onChange={(e) => call(url, { assigneeUserId: e.target.value || null }, "PATCH")} className={overlay}>
      <option value="">Unassigned</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
  return (
    <div className={`group min-w-0 max-w-[12rem] ${overdue ? "rounded-md p-0.5 ring-1 ring-red-400" : ""}`} title={title ?? hint}>
      <span className={`relative block truncate rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${TONE[status]} ${busy ? "opacity-60" : ""}`} title={OBLIGATION_STATUS_LABELS[status]}>
        {SHORT_LABEL[status] ?? OBLIGATION_STATUS_LABELS[status]}
        <select aria-label="Status" value={status} disabled={disabled} onChange={(e) => call(url, { status: e.target.value }, "PATCH")} className={overlay}>
          {OBLIGATION_STATUSES.map((s) => <option key={s} value={s}>{OBLIGATION_STATUS_LABELS[s]}</option>)}
        </select>
      </span>
      <div className="relative mt-0.5 flex flex-wrap items-center gap-x-1 px-1 text-[10px] leading-4 text-ink-500">
        {hint && <span className="min-w-0 max-w-full truncate">{hint}</span>}
        {children}
        {docsHref && <Link href={docsHref} className={`underline ${docsCount ? "font-semibold text-brand-700" : ""}`} title={docsCount ? `${docsCount} supporting document${docsCount === 1 ? "" : "s"}` : "Supporting documents"}>docs{docsCount ? ` (${docsCount})` : ""}</Link>}
        {assignee ? (
          <span className="relative ml-auto inline-flex shrink-0 items-center rounded bg-slate-100 px-1 font-semibold text-ink-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500" title={`Assigned to ${assignee.name}`}>
            {initials(assignee.name)}
            {assigneeSelect}
          </span>
        ) : canWrite ? (
          <span className="absolute right-0 top-0 inline-flex items-center rounded px-1 font-semibold text-brand-600 opacity-0 group-hover:opacity-100 has-[:focus-visible]:opacity-100" title="Assign">
            +
            {assigneeSelect}
          </span>
        ) : null}
      </div>
      {error && <span className="px-1 text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
