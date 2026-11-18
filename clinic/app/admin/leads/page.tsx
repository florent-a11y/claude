import { listLeads } from "@/lib/store";
import { baliTime, waDigits } from "@/lib/admin-ui";
import { leadHandledAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLeads() {
  const leads = await listLeads();
  return (
    <>
      <h1 className="font-display text-4xl font-semibold text-forest-900">Messages</h1>
      <p className="mt-2 text-sm text-ink-500">Sent from the contact form. Newest first.</p>
      <ul className="mt-6 space-y-4">
        {leads.length === 0 && <li className="rounded-2xl border border-sand-200 bg-white p-8 text-center text-ink-500">No messages yet.</li>}
        {leads.map((l) => {
          const digits = /^[+\d\s().-]{7,}$/.test(l.contact) ? waDigits(l.contact) : "";
          return (
            <li key={l.id} className={`rounded-2xl border border-sand-200 bg-white p-5 ${l.handledAt ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-semibold text-forest-900">{l.name} <span className="ml-2 rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-bold text-forest-700">{l.topic}</span> <span className="ml-1 text-xs font-normal text-ink-500">{l.locale.toUpperCase()}</span></p>
                <p className="text-sm text-ink-500">{baliTime(l.createdAt)}</p>
              </div>
              <p className="mt-1 text-sm text-ink-700">
                {digits ? <a className="underline underline-offset-2" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">{l.contact}</a>
                  : l.contact.includes("@") ? <a className="underline underline-offset-2" href={`mailto:${l.contact}`}>{l.contact}</a> : l.contact}
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-900">{l.message}</p>
              <form action={leadHandledAction} className="mt-4">
                <input type="hidden" name="id" value={l.id} />
                <button type="submit" className="btn-secondary btn-sm">{l.handledAt ? "Mark as open again" : "Mark as handled"}</button>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
