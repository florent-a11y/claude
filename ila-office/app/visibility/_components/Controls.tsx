"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Progress = { ok: boolean; error?: string; runId?: string; status?: string; total?: number; done?: number; errors?: number };

async function post(url: string, body?: unknown): Promise<Progress & Record<string, unknown>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 200) || res.statusText }; }
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/**
 * Starts a run (or picks up the one in progress) and keeps asking the server to continue until every question is
 * answered. Each call lasts a few minutes at most, so the tab must stay open; the weekly schedule needs no tab.
 */
export function RunButton({ open, disabled, retryRunId, label = "Run now" }: { open?: { runId: string; done: number; total: number } | null; disabled?: string; retryRunId?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(open ? { done: open.done, total: open.total } : null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function run() {
    setBusy(true); setError(null);
    let runId = open?.runId ?? retryRunId;
    let stalled = 0; let last = -1;
    if (retryRunId && !open) {
      const r = await post("/api/visibility/run", { action: "retry", runId: retryRunId });
      if (!r.ok) { setError(r.error ?? "Failed"); setBusy(false); return; }
      setProgress({ done: r.done ?? 0, total: r.total ?? 0 });
      if (r.status === "done") { setBusy(false); router.refresh(); return; }
    } else if (!runId) {
      const r = await post("/api/visibility/run", { action: "start" });
      if (!r.ok || !r.runId) { setError(r.error ?? "Could not start"); setBusy(false); return; }
      runId = r.runId; setProgress({ done: r.done ?? 0, total: r.total ?? 0 });
    }
    while (alive.current) {
      const r = await post("/api/visibility/run", { action: "continue", runId });
      if (!r.ok) { setError(r.error ?? "Failed"); break; }
      setProgress({ done: r.done ?? 0, total: r.total ?? 0 });
      if (r.status === "done") break;
      // Three passes without a single new answer: stop instead of looping for ever.
      stalled = r.done === last ? stalled + 1 : 0; last = r.done ?? 0;
      if (stalled >= 3) { setError("No progress. Check the API keys and try again."); break; }
    }
    if (alive.current) { setBusy(false); router.refresh(); }
  }

  const text = busy ? (progress ? `Asking… ${progress.done}/${progress.total}` : "Starting…") : open ? `Resume run (${open.done}/${open.total})` : label;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={retryRunId && !open ? "btn-secondary" : "btn-primary"} onClick={run} disabled={busy || !!disabled} title={disabled}>{text}</button>
      {busy && <span className="text-xs text-ink-500">Keep this tab open: a full run takes several minutes.</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function AuditButton({ label = "Run audit" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setError(null); const r = await post("/api/visibility/audit"); if (!r.ok) setError(r.error ?? "Failed"); setBusy(false); router.refresh(); }}>{busy ? "Crawling the site…" : label}</button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

/** Drafts an article for a prompt (or a free question) and opens it. Research and writing take two to four minutes. */
export function DraftButton({ promptId, question, label = "Draft article", className = "btn-secondary !px-3 !py-1 text-xs", disabled }: { promptId?: string; question?: string; label?: string; className?: string; disabled?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className={className} disabled={busy || !!disabled} title={disabled}
        onClick={async () => { setBusy(true); setError(null); const r = await post("/api/visibility/articles", { promptId, question }); if (r.ok && typeof r.id === "string") router.push(`/visibility/articles/${r.id}`); else { setError(r.error ?? "Failed"); setBusy(false); } }}>
        {busy ? "Researching and writing…" : label}
      </button>
      {busy && <span className="text-[11px] text-ink-500">2 to 4 minutes, keep this tab open</span>}
      {error && <span className="max-w-xs text-right text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function CopyText({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? "Copied" : label}</button>;
}
