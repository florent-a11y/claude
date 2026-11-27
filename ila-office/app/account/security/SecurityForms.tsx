"use client";
import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import type { CodesState } from "./actions";

type CodesAction = (prev: CodesState, fd: FormData) => Promise<CodesState>;
interface Bound { action: (fd: FormData) => void; pending: boolean; error?: string }
const Gate = createContext<{ confirm: Bound; fresh: Bound } | null>(null);

/** The recovery codes, shown once: they are not stored in a form that can be shown again. */
function RecoveryCodes({ codes, doneHref }: { codes: string[]; doneHref: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="space-y-3" data-testid="recovery-codes">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Save these recovery codes now.</p>
        <p className="mt-1 text-xs">They are shown only this once. Each one signs you in a single time if you do not have your phone. Keep them in your password manager or on paper, not in your email.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-center tracking-wider">{c}</li>)}</ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={copy}>{copied ? "Copied" : "Copy the codes"}</button>
        <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
        <button type="button" className="btn-primary" onClick={() => window.location.assign(doneHref)}>I have saved them</button>
      </div>
    </div>
  );
}

/**
 * Holds what the two forms below get back, above the part of the page that changes. Turning two-step sign-in on
 * re-issues the session, which makes the page render again as "on": the form that asked for the codes is gone by
 * then, so the codes must live here, in a component that stays in place, or they would vanish before being read.
 */
export function RecoveryCodesGate({ confirmAction, newCodesAction, doneHref, children }: { confirmAction: CodesAction; newCodesAction: CodesAction; doneHref: string; children: ReactNode }) {
  const [confirmed, confirm, confirming] = useActionState(confirmAction, {});
  const [made, fresh, making] = useActionState(newCodesAction, {});
  // Where "I have saved them" leads is decided when the page opens: the render that follows the setup no longer knows it was held.
  const [done] = useState(doneHref);
  const codes = confirmed.codes ?? made.codes;
  if (codes) return <RecoveryCodes codes={codes} doneHref={done} />;
  return <Gate.Provider value={{ confirm: { action: confirm, pending: confirming, error: confirmed.error }, fresh: { action: fresh, pending: making, error: made.error } }}>{children}</Gate.Provider>;
}

function useGate() {
  const gate = useContext(Gate);
  if (!gate) throw new Error("This form belongs inside RecoveryCodesGate");
  return gate;
}

/** Last step of the setup: a first code from the app turns two-step sign-in on and reveals the recovery codes. */
export function ConfirmSetupForm() {
  const { confirm } = useGate();
  return (
    <form action={confirm.action} className="space-y-2">
      <label className="block"><span className="label">Code shown by the app</span>
        <input name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={10} className="input w-40 text-center text-lg tracking-widest" placeholder="123 456" aria-label="Code shown by the app" />
      </label>
      {confirm.error && <p className="text-sm text-red-700" role="alert" data-testid="form-error">{confirm.error}</p>}
      <button className="btn-primary" disabled={confirm.pending}>{confirm.pending ? "Checking…" : "Turn on two-step sign-in"}</button>
    </form>
  );
}

/** New recovery codes against the account's password; the old ones stop working. */
export function NewCodesForm() {
  const { fresh } = useGate();
  return (
    <form action={fresh.action} className="flex flex-wrap items-end gap-2">
      <label className="block"><span className="label">Your password</span><input name="password" type="password" required autoComplete="current-password" className="input w-56" aria-label="Password, to make new recovery codes" /></label>
      <button className="btn-secondary" disabled={fresh.pending}>{fresh.pending ? "Working…" : "Make new recovery codes"}</button>
      {fresh.error && <p className="w-full text-sm text-red-700" role="alert" data-testid="form-error">{fresh.error}</p>}
    </form>
  );
}
