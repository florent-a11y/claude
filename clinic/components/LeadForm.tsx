"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

const TOPICS = ["consult", "booking", "order", "membership", "other"] as const;

export function LeadForm() {
  const t = useTranslations("Contact.form");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setState("sending");
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, locale }) });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      setState("sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") return <p role="status" className="rounded-2xl bg-sage-100 px-5 py-4 font-medium text-forest-900">{t("sent")}</p>;
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="label" htmlFor="lead-name">{t("name")}</label>
        <input id="lead-name" name="name" className="input" required minLength={2} maxLength={120} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="lead-contact">{t("contact")}</label>
        <input id="lead-contact" name="contact" className="input" required minLength={5} maxLength={200} aria-describedby="lead-contact-hint" />
        <p id="lead-contact-hint" className="hint">{t("contactHint")}</p>
      </div>
      <div>
        <label className="label" htmlFor="lead-topic">{t("topic")}</label>
        <select id="lead-topic" name="topic" className="input" defaultValue="consult">
          {TOPICS.map((x) => <option key={x} value={x}>{t(`topics.${x}`)}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="lead-message">{t("message")}</label>
        <textarea id="lead-message" name="message" className="input min-h-32" required minLength={5} maxLength={2000} aria-describedby="lead-message-hint" />
        <p id="lead-message-hint" className="hint">{t("messageHint")}</p>
      </div>
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {state === "error" && <p role="alert" className="error">{t("error")}</p>}
      <button type="submit" className="btn-primary" disabled={state === "sending"}>{state === "sending" ? t("sending") : t("send")}</button>
    </form>
  );
}
