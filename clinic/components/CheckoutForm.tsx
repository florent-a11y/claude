"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AREAS, BALI_OFFSET_MIN, SLOTS, type Slot } from "@/lib/config";
import { quote } from "@/lib/pricing";
import { idr } from "@/lib/money";
import { CONDITIONS, ageOn, type Condition, type PayMethod } from "@/lib/schema";
import type { MethodInfo } from "@/lib/pay/methods";
import { useCart } from "./cart";

type Errors = Record<string, string>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s().-]{7,}$/;

interface Props {
  methods: MethodInfo[];
  /** Card currency and rupiah per unit, to show the approximate card charge. Null when unknown. */
  card: { currency: string; idrPerUnit: number } | null;
  /** Today and the last bookable day in Bali (YYYY-MM-DD), computed on the server. */
  today: string;
  maxDate: string;
}

export function CheckoutForm({ methods, card, today, maxDate }: Props) {
  const t = useTranslations("Checkout");
  const cartT = useTranslations("Cart");
  const cat = useTranslations("Catalog.items");
  const c = useTranslations("Common");
  const locale = useLocale();
  const { items, ready, clear } = useCart();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"clinic" | "address">("address");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot | "">("");
  const [notes, setNotes] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "other">("female");
  const [weight, setWeight] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [goals, setGoals] = useState("");
  const [payment, setPayment] = useState<PayMethod | "">(methods[0]?.method ?? "");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [medical, setMedical] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [topError, setTopError] = useState("");
  const [sending, setSending] = useState(false);

  const q = useMemo(() => quote(items, { mode, area }), [items, mode, area]);
  const showWhen = q.hasSession || (q.needsFulfilment && mode === "address");

  /** Windows that are already over today in Bali cannot be chosen. */
  const baliHour = new Date(Date.now() + BALI_OFFSET_MIN * 60_000).getUTCHours();
  const slotPassed = (s: Slot) => date === today && Number(s.slice(6, 8)) <= baliHour;

  if (!ready) return <div className="min-h-64" aria-busy="true" />;
  if (q.lines.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="lead">{t("empty")}</p>
        <Link href="/iv-drips" className="btn-primary mt-6">{cartT("emptyCta")}</Link>
      </div>
    );
  }

  /** Wraps a setter so that editing a field removes its error message. */
  function editing<T>(field: string, set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setErrors((cur) => {
        if (!cur[field]) return cur;
        const { [field]: _gone, ...rest } = cur;
        return rest;
      });
    };
  }

  function toggleCondition(cond: Condition) {
    editing("conditions", () => {})(undefined);
    setConditions((cur) => {
      if (cond === "none") return cur.includes("none") ? [] : ["none"];
      const without = cur.filter((x) => x !== "none");
      return without.includes(cond) ? without.filter((x) => x !== cond) : [...without, cond];
    });
  }

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = "name";
    if (!EMAIL.test(email.trim())) e.email = "email";
    if (!PHONE.test(phone.trim())) e.phone = "phone";
    if (q.needsFulfilment) {
      if (mode === "address") {
        if (!area) e.area = "area";
        if (address.trim().length < 8) e.address = "address";
      }
      if (q.hasSession && !date) e.date = "date";
      if (date && (date < today || date > maxDate)) e.date = "date";
      if (q.hasSession && !slot) e.slot = "slot";
      if (slot && slotPassed(slot)) e.slot = "slot_passed";
    }
    if (q.needsHealth) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) e.dob = "dob";
      else if (ageOn(dob, today) < 18) e.dob = "underage";
      if (conditions.length === 0) e.conditions = "conditions";
      if (allergies.trim().length < 2) e.allergies = "allergies";
      if (medications.trim().length < 2) e.medications = "medications";
      if (!medical) e.medical = "consent";
    }
    if (!q.hasRx && !payment) e.payment = "payment";
    if (!adult) e.adult = "consent";
    if (!terms) e.terms = "consent";
    return e;
  }

  function focusFirst(e: Errors) {
    const first = Object.keys(e)[0];
    if (!first) return;
    const el = document.getElementById(`co-${first}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (sending) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setTopError(t("errors.summary"));
      focusFirst(found);
      return;
    }
    setTopError("");
    setSending(true);
    try {
      const weightKg = Number(weight);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items,
          contact: { name: name.trim(), email: email.trim(), phone: phone.trim(), locale },
          fulfilment: {
            mode: q.needsFulfilment ? mode : "clinic",
            ...(mode === "address" && q.needsFulfilment ? { area, address: address.trim() } : {}),
            ...(showWhen && date ? { date } : {}),
            ...(showWhen && date && slot ? { slot } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
          ...(q.needsHealth ? {
            health: {
              dob, sex, conditions, allergies: allergies.trim(), medications: medications.trim(), goals: goals.trim(),
              ...(weight && weightKg >= 30 && weightKg <= 250 ? { weightKg } : {}),
            },
          } : {}),
          ...(q.hasRx ? {} : { payment }),
          consents: { terms, adult, medical: q.needsHealth ? medical : false },
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string; field?: string };
      if (!res.ok || !data.redirect) {
        const code = data.error ?? "generic";
        if (data.field) {
          const serverErrors = { [data.field]: code };
          setErrors(serverErrors);
          setTopError(t("errors.summary"));
          focusFirst(serverErrors);
        } else {
          setTopError(t(`errors.${["items", "rate", "payment"].includes(code) ? code : "generic"}`));
        }
        setSending(false);
        return;
      }
      clear();
      window.location.assign(data.redirect);
    } catch {
      setTopError(t("errors.generic"));
      setSending(false);
    }
  }

  // The "check the highlighted fields" banner goes away once nothing is highlighted any more.
  const banner = topError === t("errors.summary") && Object.keys(errors).length === 0 ? "" : topError;
  const err = (field: string) => (errors[field] ? <p id={`co-${field}-error`} className="error">{t(`errors.${errors[field]}`)}</p> : null);
  const aria = (field: string, hint?: string) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [errors[field] ? `co-${field}-error` : "", hint ?? ""].filter(Boolean).join(" ") || undefined,
  });
  const cls = (field: string, extra = "") => `input ${errors[field] ? "input-error" : ""} ${extra}`;

  const methodCopy: Record<PayMethod, { title: string; text: string }> = {
    xendit: { title: t("payment.xendit"), text: t("payment.xenditText") },
    airwallex: {
      title: t("payment.airwallex"),
      text: `${t("payment.airwallexText")}${card ? ` ${t("payment.airwallexCharge", { amount: `${card.currency} ${(q.totalIdr / card.idrPerUnit).toFixed(2)}` })}` : ""}`,
    },
    transfer: { title: t("payment.transfer"), text: t("payment.transferText") },
    cod: { title: t("payment.cod"), text: t("payment.codText") },
  };
  const submitLabel = q.hasRx ? t("submitReview") : payment === "xendit" || payment === "airwallex" ? t("submitPay") : t("submitOrder");

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1.45fr_1fr]">
      <div className="space-y-12">
        {/* Contact */}
        <fieldset>
          <legend className="font-display text-3xl font-semibold text-deep-900">{t("contact.title")}</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="co-name">{t("contact.name")}</label>
              <input id="co-name" className={cls("name")} value={name} onChange={(e) => editing("name", setName)(e.target.value)} autoComplete="name" maxLength={120} {...aria("name", "co-name-hint")} />
              <p id="co-name-hint" className="hint">{t("contact.nameHint")}</p>
              {err("name")}
            </div>
            <div>
              <label className="label" htmlFor="co-email">{t("contact.email")}</label>
              <input id="co-email" type="email" inputMode="email" className={cls("email")} value={email} onChange={(e) => editing("email", setEmail)(e.target.value)} autoComplete="email" maxLength={200} {...aria("email")} />
              {err("email")}
            </div>
            <div>
              <label className="label" htmlFor="co-phone">{t("contact.phone")}</label>
              <input id="co-phone" type="tel" inputMode="tel" className={cls("phone")} value={phone} onChange={(e) => editing("phone", setPhone)(e.target.value)} autoComplete="tel" maxLength={30} {...aria("phone", "co-phone-hint")} />
              <p id="co-phone-hint" className="hint">{t("contact.phoneHint")}</p>
              {err("phone")}
            </div>
          </div>
        </fieldset>

        {/* Where and when */}
        <fieldset>
          <legend className="font-display text-3xl font-semibold text-deep-900">{t("fulfilment.title")}</legend>
          {!q.needsFulfilment ? (
            <p className="mt-4 rounded-2xl bg-tide-100 px-5 py-4 text-sm leading-relaxed text-deep-900">{t("fulfilment.membershipOnly")}</p>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("fulfilment.title")}>
                {([
                  { value: "address", title: t("fulfilment.address"), text: q.hasSession ? t("fulfilment.addressSessionText") : t("fulfilment.addressDeliveryText") },
                  { value: "clinic", title: q.hasSession ? t("fulfilment.clinicSession") : t("fulfilment.clinicPickup"), text: q.hasSession ? t("fulfilment.clinicSessionText") : t("fulfilment.clinicPickupText") },
                ] as const).map((o) => (
                  <label key={o.value} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${mode === o.value ? "border-deep-800 bg-tide-100/60" : "border-mist-300 bg-white hover:border-deep-800/40"}`}>
                    <input type="radio" name="mode" className="mt-1 h-4 w-4 accent-deep-700" checked={mode === o.value} onChange={() => setMode(o.value)} />
                    <span><span className="block font-semibold text-deep-900">{o.title}</span><span className="mt-0.5 block text-sm text-ink-700">{o.text}</span></span>
                  </label>
                ))}
              </div>
              {mode === "address" && (
                <>
                  <div>
                    <label className="label" htmlFor="co-area">{t("fulfilment.area")}</label>
                    <select id="co-area" className={cls("area")} value={area} onChange={(e) => editing("area", setArea)(e.target.value)} {...aria("area")}>
                      <option value="">{t("fulfilment.areaPlaceholder")}</option>
                      {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    {err("area")}
                  </div>
                  <div>
                    <label className="label" htmlFor="co-address">{t("fulfilment.addressLabel")}</label>
                    <textarea id="co-address" className={cls("address", "min-h-24")} value={address} onChange={(e) => editing("address", setAddress)(e.target.value)} autoComplete="street-address" maxLength={300} {...aria("address", "co-address-hint")} />
                    <p id="co-address-hint" className="hint">{t("fulfilment.addressHint")}</p>
                    {err("address")}
                  </div>
                </>
              )}
              {showWhen && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="co-date">{t("fulfilment.date")}</label>
                    <input id="co-date" type="date" className={cls("date")} min={today} max={maxDate} value={date} onChange={(e) => editing("date", setDate)(e.target.value)} {...aria("date")} />
                    {err("date")}
                  </div>
                  <div>
                    <label className="label" htmlFor="co-slot">{t("fulfilment.slot")}</label>
                    <select id="co-slot" className={cls("slot")} value={slot} onChange={(e) => editing("slot", setSlot)(e.target.value as Slot | "")} {...aria("slot", "co-slot-hint")}>
                      <option value="">{t("fulfilment.slotPlaceholder")}</option>
                      {SLOTS.map((s) => <option key={s} value={s} disabled={slotPassed(s)}>{s.replace("-", " – ")}</option>)}
                    </select>
                    {err("slot")}
                  </div>
                  <p id="co-slot-hint" className="hint sm:col-span-2">{t("fulfilment.slotNote")}</p>
                </div>
              )}
              <div>
                <label className="label" htmlFor="co-notes">{t("fulfilment.notes")}</label>
                <textarea id="co-notes" className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </div>
            </div>
          )}
        </fieldset>

        {/* Health questionnaire */}
        {q.needsHealth && (
          <fieldset>
            <legend className="font-display text-3xl font-semibold text-deep-900">{t("health.title")}</legend>
            <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink-700"><Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-coral-500" aria-hidden="true" />{t("health.intro")}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="co-dob">{t("health.dob")}</label>
                <input id="co-dob" type="date" className={cls("dob")} max={today} value={dob} onChange={(e) => editing("dob", setDob)(e.target.value)} autoComplete="bday" {...aria("dob")} />
                {err("dob")}
              </div>
              <div>
                <label className="label" htmlFor="co-sex">{t("health.sex")}</label>
                <select id="co-sex" className="input" value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}>
                  {(["female", "male", "other"] as const).map((s) => <option key={s} value={s}>{t(`health.sexOptions.${s}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="co-weight">{t("health.weight")}</label>
                <input id="co-weight" type="number" inputMode="decimal" min={30} max={250} className="input" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <div className="mt-6" role="group" aria-labelledby="co-conditions-label" {...aria("conditions")}>
              <p id="co-conditions-label" className="label">{t("health.conditions")}</p>
              <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {CONDITIONS.map((cond, i) => (
                  <label key={cond} className={`flex cursor-pointer gap-2.5 text-sm text-ink-700 ${cond === "none" ? "font-semibold text-deep-900 sm:col-span-2" : ""}`}>
                    <input id={i === 0 ? "co-conditions" : undefined} type="checkbox" className="checkbox" checked={conditions.includes(cond)} onChange={() => toggleCondition(cond)} />
                    {t(`health.conditionOptions.${cond}`)}
                  </label>
                ))}
              </div>
              {err("conditions")}
            </div>
            <div className="mt-6 space-y-5">
              <div>
                <label className="label" htmlFor="co-allergies">{t("health.allergies")}</label>
                <input id="co-allergies" className={cls("allergies")} value={allergies} onChange={(e) => editing("allergies", setAllergies)(e.target.value)} maxLength={500} {...aria("allergies", "co-allergies-hint")} />
                <p id="co-allergies-hint" className="hint">{t("health.allergiesHint")}</p>
                {err("allergies")}
              </div>
              <div>
                <label className="label" htmlFor="co-medications">{t("health.medications")}</label>
                <input id="co-medications" className={cls("medications")} value={medications} onChange={(e) => editing("medications", setMedications)(e.target.value)} maxLength={500} {...aria("medications", "co-medications-hint")} />
                <p id="co-medications-hint" className="hint">{t("health.medicationsHint")}</p>
                {err("medications")}
              </div>
              <div>
                <label className="label" htmlFor="co-goals">{t("health.goals")}</label>
                <textarea id="co-goals" className="input min-h-24" value={goals} onChange={(e) => setGoals(e.target.value)} maxLength={1000} aria-describedby="co-goals-hint" />
                <p id="co-goals-hint" className="hint">{t("health.goalsHint")}</p>
              </div>
            </div>
          </fieldset>
        )}

        {/* Payment */}
        <fieldset>
          <legend className="font-display text-3xl font-semibold text-deep-900">{t("payment.title")}</legend>
          {q.hasRx ? (
            <p className="mt-4 flex gap-3 rounded-2xl bg-coral-50 px-5 py-4 text-sm leading-relaxed text-deep-900"><Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-coral-600" aria-hidden="true" />{t("payment.afterReview")}</p>
          ) : (
            <div className="mt-5 space-y-3" role="radiogroup" aria-label={t("payment.choose")}>
              {methods.map((m, i) => (
                <label key={m.method} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${payment === m.method ? "border-deep-800 bg-tide-100/60" : "border-mist-300 bg-white hover:border-deep-800/40"}`}>
                  <input id={i === 0 ? "co-payment" : undefined} type="radio" name="payment" className="mt-1 h-4 w-4 accent-deep-700" checked={payment === m.method} onChange={() => editing<PayMethod | "">("payment", setPayment)(m.method)} />
                  <span>
                    <span className="block font-semibold text-deep-900">{methodCopy[m.method].title}</span>
                    <span className="mt-0.5 block text-sm text-ink-700">{methodCopy[m.method].text}</span>
                    {m.simulated && <span className="mt-1 block text-xs font-medium text-coral-600">{t("payment.simulated")}</span>}
                  </span>
                </label>
              ))}
              {err("payment")}
            </div>
          )}
        </fieldset>

        {/* Consents */}
        <div className="space-y-4">
          <div>
            <label className="flex cursor-pointer gap-3 text-sm text-ink-700">
              <input id="co-adult" type="checkbox" className="checkbox" checked={adult} onChange={(e) => editing("adult", setAdult)(e.target.checked)} {...aria("adult")} />
              <span>{t("consents.adult")}</span>
            </label>
            {err("adult")}
          </div>
          <div>
            <label className="flex cursor-pointer gap-3 text-sm text-ink-700">
              <input id="co-terms" type="checkbox" className="checkbox" checked={terms} onChange={(e) => editing("terms", setTerms)(e.target.checked)} {...aria("terms")} />
              <span>{t.rich("consents.terms", {
                terms: (chunks) => <Link href="/legal/terms" target="_blank" className="font-semibold text-deep-700 underline underline-offset-2">{chunks}</Link>,
                privacy: (chunks) => <Link href="/legal/privacy" target="_blank" className="font-semibold text-deep-700 underline underline-offset-2">{chunks}</Link>,
              })}</span>
            </label>
            {err("terms")}
          </div>
          {q.needsHealth && (
            <div>
              <label className="flex cursor-pointer gap-3 text-sm text-ink-700">
                <input id="co-medical" type="checkbox" className="checkbox" checked={medical} onChange={(e) => editing("medical", setMedical)(e.target.checked)} {...aria("medical")} />
                <span>{t.rich("consents.medical", {
                  disclaimer: (chunks) => <Link href="/legal/medical" target="_blank" className="font-semibold text-deep-700 underline underline-offset-2">{chunks}</Link>,
                })}</span>
              </label>
              {err("medical")}
            </div>
          )}
        </div>
        {/* Honeypot: hidden from people, filled by bots. */}
        <div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
      </div>

      {/* Summary */}
      <aside className="card h-fit lg:sticky lg:top-28">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold text-deep-900">{t("summary.title")}</h2>
          <Link href="/cart" className="text-sm font-semibold text-deep-700 underline-offset-4 hover:underline">{t("summary.edit")}</Link>
        </div>
        <ul className="mt-4 divide-y divide-mist-200 border-y border-mist-200 text-sm">
          {q.lines.map((l) => (
            <li key={l.slug} className="flex justify-between gap-4 py-3">
              <span className="text-ink-700">
                <span className="font-semibold text-deep-900">{l.qty} × {cat(`${l.slug}.name`)}</span>
                {l.rx && <span className="mt-0.5 block text-xs font-medium text-coral-600">{c("doctorReview")}</span>}
              </span>
              <span className="whitespace-nowrap font-medium text-deep-900">{idr(l.unitIdr * l.qty, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-700">{t("summary.subtotal")}</dt><dd className="font-medium">{idr(q.subtotalIdr, locale)}</dd></div>
          {q.needsFulfilment && mode === "address" && (
            <div className="flex justify-between">
              <dt className="text-ink-700">{q.hasSession ? t("summary.callout") : t("summary.delivery")}</dt>
              <dd className="font-medium">{!area ? t("summary.chooseArea") : q.calloutIdr + q.deliveryIdr === 0 ? t("summary.free") : idr(q.calloutIdr + q.deliveryIdr, locale)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-mist-200 pt-3">
            <dt className="font-semibold text-deep-900">{t("summary.total")}</dt>
            <dd className="font-display text-3xl font-semibold text-deep-900">{idr(q.totalIdr, locale)}</dd>
          </div>
        </dl>
        {banner && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{banner}</p>}
        <button type="submit" className="btn-primary mt-5 w-full" disabled={sending}>{sending ? t("submitting") : submitLabel}</button>
      </aside>
    </form>
  );
}
