"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/lib/schema";

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

export function OrderActions({ id, status, notes, orderJson }: { id: string; status: OrderStatus; notes: string; orderJson: string }) {
  const router = useRouter();
  const [n, setN] = useState(notes);
  const [busy, setBusy] = useState(false);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="card mt-6">
      <div className="flex flex-wrap gap-2">
        {status === "paid" && <button className="btn-secondary !py-2 text-sm" disabled={busy} onClick={() => patch({ status: "in_progress" })}>Start processing</button>}
        {(status === "paid" || status === "in_progress") && <button className="btn-primary !py-2 text-sm" disabled={busy} onClick={() => patch({ status: "delivered" })}>Mark delivered</button>}
        {status !== "refunded" && status !== "delivered" && <button className="btn-ghost !py-2 text-sm" disabled={busy} onClick={() => patch({ status: "refunded" })}>Mark refunded</button>}
        <button className="btn-ghost !py-2 text-sm" onClick={() => navigator.clipboard.writeText(orderJson)}>Copy order JSON for autofill extension</button>
      </div>
      <label className="mt-4 block"><span className="label">Ops notes</span><textarea className="input" rows={3} value={n} onChange={(e) => setN(e.target.value)} /></label>
      <button className="btn-secondary mt-2 !py-2 text-sm" disabled={busy} onClick={() => patch({ opsNotes: n })}>Save notes</button>
    </div>
  );
}
