"use client";

import { useActionState, useEffect, useRef } from "react";
import { addContact } from "@/lib/actions/clients";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function ContactForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(addContact.bind(null, clientId), idle);
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
        <input name="title" className="input" placeholder="e.g. Finance Director" />
      </div>
      <div>
        <label className="label">Email (their login)</label>
        <input name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Temporary password</label>
        <input name="password" type="text" minLength={8} required className="input" placeholder="At least 8 characters" />
        <p className="mt-1 text-xs text-slate-400">Share it with them privately. They can change it in Settings.</p>
      </div>
      <FormMessage state={state} success="Contact created. They can sign in now." />
      <SubmitButton className="btn btn-primary btn-sm w-full" pendingText="Creating…">Create portal access</SubmitButton>
    </form>
  );
}
