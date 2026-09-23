"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function QuickAck({ id }: { id: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} className="ml-2 rounded bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50" onClick={async () => {
      setBusy(true);
      await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ acknowledge: true }) });
      r.refresh();
    }}>{busy ? "…" : "Acknowledge"}</button>
  );
}
