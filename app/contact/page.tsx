import type { Metadata } from "next";
import { site } from "@/lib/config";

export const metadata: Metadata = { title: "Contact & support" };

export default function Contact() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Contact & support</h1>
      <p className="mt-2 text-ink-700">Support hours: 07:00–23:00 Jakarta time (UTC+7), every day. Typical response time under 15 minutes for paid orders.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="card"><h2 className="font-semibold">Email</h2><a className="mt-2 block text-brand-600 underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></div>
        <div className="card"><h2 className="font-semibold">Order questions</h2><p className="mt-2 text-sm text-ink-700">Reply to your confirmation email with your order number and we answer within 15 minutes during support hours.</p></div>
      </div>
      <div className="card mt-6 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">{site.company}</p>
      </div>
    </div>
  );
}
