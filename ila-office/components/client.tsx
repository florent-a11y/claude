"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

/** Client-side helpers. Prefer server actions for mutations; these only add progressive touches. */

export function SubmitButton({ children, className = "btn-primary", pendingText = "Saving…" }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? pendingText : children}</button>;
}

/** A form whose submission asks for confirmation first (deletes, voids, posting). */
export function ConfirmForm({ action, message, children, className = "inline" }: { action: (fd: FormData) => void | Promise<void>; message: string; children: ReactNode; className?: string }) {
  return <form action={action} className={className} onSubmit={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</form>;
}

export function CopyButton({ value, label = "copy" }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="text-xs text-brand-600 underline" onClick={async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}>{ok ? "copied" : label}</button>;
}

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return <button type="button" className="btn-secondary no-print" onClick={() => window.print()}>{label}</button>;
}

/** Auto-submits a search form shortly after typing stops. */
export function AutoSubmitInput({ name, defaultValue, placeholder, className = "input" }: { name: string; defaultValue?: string; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return <input ref={ref} name={name} defaultValue={defaultValue} placeholder={placeholder} className={className} onChange={() => { if (t.current) clearTimeout(t.current); t.current = setTimeout(() => ref.current?.form?.requestSubmit(), 400); }} />;
}

/** Simple JSON API caller for interactive widgets (kanban moves, inline toggles). Refreshes server data after success. */
export function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(url: string, body?: unknown, method = "POST") {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* plain text */ }
      if (!res.ok) { setError(typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : text || res.statusText); return null; }
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }
  return { call, busy, error };
}

/** Flash message that fades after a few seconds. */
export function Flash({ message }: { message?: string }) {
  const [show, setShow] = useState(Boolean(message));
  useEffect(() => { if (!message) return; setShow(true); const t = setTimeout(() => setShow(false), 4000); return () => clearTimeout(t); }, [message]);
  if (!show || !message) return null;
  return <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-ink-900 px-4 py-2 text-sm text-white shadow-lg">{message}</div>;
}
