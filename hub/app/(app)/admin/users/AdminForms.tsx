"use client";

import { useActionState, useEffect, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { createTeamMember, resetUserPassword } from "@/lib/actions/team";
import { createClientUser } from "@/lib/actions/clients";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { Modal } from "@/components/ActionModals";

export function InviteDialog({ kind, companies = [] }: { kind: "internal" | "client"; companies?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(kind === "internal" ? createTeamMember : createClientUser, idle);
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Invite</button>
      {open && (
        <Modal title={kind === "internal" ? "Invite an internal user" : "Invite a client"} onClose={() => setOpen(false)}>
          <form action={action} className="space-y-3">
            <div><label className="label">Name</label><input name="name" required className="input" autoFocus /></div>
            <div><label className="label">Email (their login)</label><input name="email" type="email" required className="input" /></div>
            {kind === "internal" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Job title</label><input name="title" className="input" placeholder="e.g. Legal Associate" /></div>
                <div><label className="label">Role</label><select name="role" defaultValue="member" className="input"><option value="member">Team member</option><option value="admin">Administrator</option></select></div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Job title</label><input name="title" className="input" placeholder="e.g. Finance Director" /></div>
                <div><label className="label">Company (optional)</label><select name="client_id" defaultValue="" className="input"><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
            )}
            <div>
              <label className="label">Temporary password</label>
              <input name="password" type="text" minLength={8} required className="input" placeholder="At least 8 characters" />
              <p className="mt-1 text-xs text-slate-400">Share it privately. They can change it in Settings.</p>
            </div>
            <FormMessage state={state} />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button><SubmitButton className="btn btn-primary btn-sm" pendingText="Creating…">Create account</SubmitButton></div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function ResetPasswordForm({ userId, userName }: { userId: string; userName: string }) {
  const [state, action] = useActionState(resetUserPassword.bind(null, userId), idle);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm px-2" title={`Reset password for ${userName}`} aria-label={`Reset password for ${userName}`}><KeyRound className="h-4 w-4" /></button>;
  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input name="password" type="text" minLength={8} required className="input w-36 py-1 text-xs" placeholder="New password" autoFocus />
      <SubmitButton className="btn btn-primary btn-sm">Set</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
