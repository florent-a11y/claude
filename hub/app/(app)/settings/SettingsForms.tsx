"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/lib/actions/settings";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { PALETTE } from "@/lib/format";
import type { PublicUser } from "@/lib/types";

export function ProfileForm({ user }: { user: PublicUser }) {
  const [state, action] = useActionState(updateProfile, idle);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input name="name" defaultValue={user.name} required className="input" />
      </div>
      <div>
        <label className="label">Job title</label>
        <input name="title" defaultValue={user.title} className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input value={user.email} disabled className="input" />
      </div>
      <div>
        <label className="label">Avatar colour</label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={user.color === c} className="peer sr-only" />
              <span className="block h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-slate-900" style={{ backgroundColor: c }} />
            </label>
          ))}
        </div>
      </div>
      <FormMessage state={state} success="Profile updated." />
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, idle);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Current password</label>
        <input name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div>
        <label className="label">New password</label>
        <input name="next" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <FormMessage state={state} success="Password changed." />
      <SubmitButton pendingText="Saving…">Change password</SubmitButton>
    </form>
  );
}
