"use client";

import { useId, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { Dictionary } from "@/content";
import { EMAIL_PATTERN, LEAD_LOCATIONS, LEAD_SECTORS, LEAD_TEAMS, WHATSAPP_PATTERN } from "@/lib/lead-fields";
import type { QuizAnswers } from "@/lib/quiz";

type Labels = Dictionary["form"];
type FieldName = "name" | "business" | "whatsapp" | "email" | "location" | "sector" | "team" | "consent";
type Status = "idle" | "sending" | "sent";

/**
 * Contact form, also shown under the quiz result. With `quiz`, the sector and team size come from the answers
 * and are not asked again. The server validates everything a second time (lib/leads.ts).
 */
export function LeadForm({ labels, locale, quiz }: { labels: Labels; locale: AppLocale; quiz?: QuizAnswers }) {
  const formId = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();

    const payload = {
      source: quiz ? "quiz" : "contact",
      locale,
      name: value("name"),
      business: value("business"),
      whatsapp: value("whatsapp"),
      email: value("email"),
      location: value("location"),
      sector: quiz ? quiz.sector : value("sector"),
      team: quiz ? quiz.team : value("team"),
      message: value("message"),
      consent: data.get("consent") === "on",
      website: value("website"),
      ...(quiz ? { quiz } : {}),
    };

    const found: Partial<Record<FieldName, string>> = {};
    if (payload.name.length < 2) found.name = labels.required;
    if (payload.business.length < 2) found.business = labels.required;
    if (!WHATSAPP_PATTERN.test(payload.whatsapp)) found.whatsapp = labels.invalidWhatsapp;
    if (payload.email && !EMAIL_PATTERN.test(payload.email)) found.email = labels.invalidEmail;
    if (!payload.location) found.location = labels.required;
    if (!payload.sector) found.sector = labels.required;
    if (!payload.team) found.team = labels.required;
    if (!payload.consent) found.consent = labels.consentRequired;
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError(labels.errorInvalid);
      return;
    }

    setStatus("sending");
    setFormError("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setStatus("sent");
        return;
      }
      setFormError(response.status === 400 ? labels.errorInvalid : response.status === 429 ? labels.errorRate : labels.errorServer);
    } catch {
      setFormError(labels.errorServer);
    }
    setStatus("idle");
  }

  if (status === "sent") {
    return (
      <div role="status" className="bubble-in rounded-3xl border border-gold-400/40 bg-gold-400/10 p-7">
        <CircleCheck size={32} aria-hidden="true" className="text-gold-700" />
        <h3 className="mt-3 text-xl font-bold text-ink-900">{labels.successTitle}</h3>
        <p className="mt-2 text-lg text-ink-700">{labels.successBody}</p>
      </div>
    );
  }

  const field = (name: FieldName) => ({
    id: `${formId}-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${formId}-${name}-error` : undefined,
  });
  const errorFor = (name: FieldName) =>
    errors[name] && (
      <p id={`${formId}-${name}-error`} className="field-error">
        {errors[name]}
      </p>
    );
  const inputClass = (name: FieldName) => `input ${errors[name] ? "input-error" : ""}`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor={`${formId}-name`} className="label">
          {labels.name}
        </label>
        <input {...field("name")} type="text" autoComplete="name" maxLength={100} className={inputClass("name")} />
        {errorFor("name")}
      </div>
      <div>
        <label htmlFor={`${formId}-business`} className="label">
          {labels.business}
        </label>
        <input {...field("business")} type="text" autoComplete="organization" maxLength={120} className={inputClass("business")} />
        {errorFor("business")}
      </div>
      <div>
        <label htmlFor={`${formId}-whatsapp`} className="label">
          {labels.whatsapp}
        </label>
        <input
          {...field("whatsapp")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          placeholder="+62"
          aria-describedby={errors.whatsapp ? `${formId}-whatsapp-error` : `${formId}-whatsapp-hint`}
          className={inputClass("whatsapp")}
        />
        {errorFor("whatsapp") || (
          <p id={`${formId}-whatsapp-hint`} className="mt-1.5 text-sm text-ink-500">
            {labels.whatsappHint}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${formId}-email`} className="label">
          {labels.email}
        </label>
        <input {...field("email")} type="email" autoComplete="email" maxLength={200} className={inputClass("email")} />
        {errorFor("email")}
      </div>
      <div className={quiz ? "sm:col-span-2" : ""}>
        <label htmlFor={`${formId}-location`} className="label">
          {labels.location}
        </label>
        <select {...field("location")} defaultValue="" className={inputClass("location")}>
          <option value="" disabled>
            {labels.choose}
          </option>
          {LEAD_LOCATIONS.map((option) => (
            <option key={option} value={option}>
              {labels.locations[option]}
            </option>
          ))}
        </select>
        {errorFor("location")}
      </div>
      {!quiz && (
        <>
          <div>
            <label htmlFor={`${formId}-sector`} className="label">
              {labels.sector}
            </label>
            <select {...field("sector")} defaultValue="" className={inputClass("sector")}>
              <option value="" disabled>
                {labels.choose}
              </option>
              {LEAD_SECTORS.map((option) => (
                <option key={option} value={option}>
                  {labels.sectors[option]}
                </option>
              ))}
            </select>
            {errorFor("sector")}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${formId}-team`} className="label">
              {labels.team}
            </label>
            <select {...field("team")} defaultValue="" className={inputClass("team")}>
              <option value="" disabled>
                {labels.choose}
              </option>
              {LEAD_TEAMS.map((option) => (
                <option key={option} value={option}>
                  {labels.teams[option]}
                </option>
              ))}
            </select>
            {errorFor("team")}
          </div>
        </>
      )}
      <div className="sm:col-span-2">
        <label htmlFor={`${formId}-message`} className="label">
          {labels.message}
        </label>
        <textarea id={`${formId}-message`} name="message" rows={4} maxLength={2000} className="input" />
      </div>
      {/* Honeypot: hidden from people and assistive technology; only bots fill it. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`${formId}-website`}>Website</label>
        <input id={`${formId}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <div className="flex items-start gap-3">
          <input
            {...field("consent")}
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 rounded accent-gold-400"
          />
          <label htmlFor={`${formId}-consent`} className="leading-relaxed text-ink-600">
            {labels.consent}{" "}
            <Link href="/privacy" className="font-semibold text-azure-600 underline underline-offset-2 hover:text-azure-700">
              {labels.consentLink}
            </Link>
            .
          </label>
        </div>
        {errorFor("consent")}
      </div>
      <div className="sm:col-span-2">
        {formError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 font-semibold text-red-200">
            {formError}
          </p>
        )}
        <button type="submit" disabled={status === "sending"} className="btn btn-primary w-full sm:w-auto">
          {status === "sending" ? `${labels.sending}…` : labels.submit}
        </button>
      </div>
    </form>
  );
}
