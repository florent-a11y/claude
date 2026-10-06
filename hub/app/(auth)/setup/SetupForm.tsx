"use client";

import { useActionState } from "react";
import { setup } from "@/lib/actions/auth";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function SetupForm() {
  const [state, action] = useActionState(setup, idle);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" required className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" minLength={8} required className="input" />
        <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn btn-primary w-full" pendingText="Creating…">Create administrator account</SubmitButton>
    </form>
  );
}
