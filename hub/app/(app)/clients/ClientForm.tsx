"use client";

import { useActionState } from "react";
import { createClient, updateClient } from "@/lib/actions/clients";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import type { Client } from "@/lib/types";

export function ClientForm({ client }: { client?: Client }) {
  const [state, action] = useActionState(client ? updateClient.bind(null, client.id) : createClient, idle);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Company name</label>
          <input name="name" defaultValue={client?.name} required className="input" autoFocus={!client} />
        </div>
        <div>
          <label className="label">Industry</label>
          <input name="industry" defaultValue={client?.industry} className="input" placeholder="e.g. Hospitality" />
        </div>
        <div>
          <label className="label">Website</label>
          <input name="website" defaultValue={client?.website} className="input" placeholder="https://" />
        </div>
        <div>
          <label className="label">Main email</label>
          <input name="email" type="email" defaultValue={client?.email} className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" defaultValue={client?.phone} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input name="address" defaultValue={client?.address} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Internal notes</label>
          <textarea name="notes" rows={4} defaultValue={client?.notes} className="input" placeholder="Context, key people, billing details, preferences… (never shown to the client)" />
        </div>
      </div>
      <FormMessage state={state} success="Saved." />
      <div className="flex justify-end"><SubmitButton pendingText="Saving…">{client ? "Save changes" : "Create client"}</SubmitButton></div>
    </form>
  );
}
