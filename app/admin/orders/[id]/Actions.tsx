"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, type Activity, type OrderStatus } from "@/lib/schema";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-2">
      <p className="text-xs text-ink-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="rounded bg-slate-50 px-2 py-1 text-sm">{value}</code>
        <button type="button" className="text-xs text-brand-600 underline" onClick={async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}>{ok ? "copied" : "copy"}</button>
      </div>
    </div>
  );
}

const NEXT: Partial<Record<OrderStatus, Array<{ to: OrderStatus; label: string; primary?: boolean }>>> = {
  paid: [{ to: "in_progress", label: "Start processing", primary: true }],
  acknowledged: [{ to: "in_progress", label: "Start processing", primary: true }],
  in_progress: [{ to: "submitted", label: "Submitted to portal", primary: true }, { to: "delivered", label: "Mark delivered" }],
  submitted: [{ to: "delivered", label: "Mark delivered (QR / e-VOA sent)", primary: true }],
  delivered: [],
};

export function OrderActions({ id, status, notes, assignee, acknowledgedAt, activity, orderJson }: { id: string; status: OrderStatus; notes: string; assignee: string; acknowledgedAt?: string; activity: Activity[]; orderJson: string }) {
  const router = useRouter();
  const [n, setN] = useState(notes);
  const [a, setA] = useState(assignee);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    router.refresh();
  }
  const terminal = status === "refunded" || status === "cancelled";
  return (
    <div className="card mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{STATUS_LABELS[status]}</span>
        {!acknowledgedAt && !terminal && status !== "pending_payment" && <button className="btn-primary !py-2 text-sm" disabled={busy} onClick={() => patch({ acknowledge: true })}>Acknowledge (I have this)</button>}
        {(NEXT[status] ?? []).map((x) => <button key={x.to} className={`${x.primary ? "btn-primary" : "btn-secondary"} !py-2 text-sm`} disabled={busy} onClick={() => patch({ status: x.to })}>{x.label}</button>)}
        {!terminal && status !== "delivered" && <button className="btn-ghost !py-2 text-sm" disabled={busy} onClick={() => confirm("Mark this order as refunded? Issue the refund in Airwallex first.") && patch({ status: "refunded" })}>Mark refunded</button>}
        <button className="btn-ghost !py-2 text-sm" onClick={() => navigator.clipboard.writeText(orderJson)}>Copy order JSON for autofill</button>
      </div>
      {acknowledgedAt && <p className="mt-2 text-xs text-ink-500">Acknowledged {new Date(acknowledgedAt).toLocaleString("en-GB")}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="block"><span className="label">Assignee</span><div className="flex gap-2"><input className="input" placeholder="team member name" value={a} onChange={(e) => setA(e.target.value)} /><button className="btn-secondary !py-2 text-sm" disabled={busy} onClick={() => patch({ assignee: a })}>Save</button></div></label>
          <label className="mt-3 block"><span className="label">Ops notes (internal)</span><textarea className="input" rows={3} value={n} onChange={(e) => setN(e.target.value)} /></label>
          <button className="btn-secondary mt-2 !py-2 text-sm" disabled={busy} onClick={() => patch({ opsNotes: n })}>Save notes</button>
        </div>
        <div>
          <p className="label">Activity</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs">
            {[...activity].reverse().map((x, i) => <li key={i}><span className="text-ink-500">{new Date(x.at).toLocaleString("en-GB")}</span> · <strong>{x.by}</strong> {x.action}{x.note ? `: ${x.note}` : ""}</li>)}
            {activity.length === 0 && <li className="text-ink-500">No activity yet.</li>}
          </ul>
          <div className="mt-2 flex gap-2"><input className="input" placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn-secondary !py-2 text-sm" disabled={busy || !comment} onClick={async () => { await patch({ note: comment }); setComment(""); }}>Add</button></div>
        </div>
      </div>
    </div>
  );
}
