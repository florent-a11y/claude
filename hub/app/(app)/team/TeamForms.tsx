"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { createTeamMember, resetUserPassword } from "@/lib/actions/team";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function NewMemberForm() {
  const [state, action] = useActionState(createTeamMember, idle);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div>
        <label className="label">Name</label>
        <input name="name" required className="input" />
      </div>
      <div>
        <label className="label">Job title</label>
        <input name="title" className="input" placeholder="e.g. Consultant" />
      </div>
      <div>
        <label className="label">Email (login)</label>
        <input name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Role</label>
        <select name="role" defaultValue="member" className="input">
          <option value="member">Team member</option>
          <option value="admin">Administrator</option>
        </select>
      </div>
      <div>
        <label className="label">Temporary password</label>
        <input name="password" type="text" minLength={8} required className="input" placeholder="At least 8 characters" />
      </div>
      <FormMessage state={state} success="Account created." />
      <SubmitButton className="btn btn-primary btn-sm w-full" pendingText="Creating…">Add team member</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ userId, userName }: { userId: string; userName: string }) {
  const [state, action] = useActionState(resetUserPassword.bind(null, userId), idle);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm" title={`Reset password for ${userName}`}><KeyRound className="h-3.5 w-3.5" /> Reset password</button>;
  return (
    <form action={action} className="flex items-center gap-1">
      <input name="password" type="text" minLength={8} required className="input w-40 py-1.5 text-xs" placeholder="New password" autoFocus />
      <SubmitButton className="btn btn-primary btn-sm">Set</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
