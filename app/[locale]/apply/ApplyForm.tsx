"use client";
import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { intlLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { messageList, validationKey } from "@/i18n/validation";
import { localizedCountries, PORTS_OF_ENTRY, PURPOSE_OPTIONS, VISA_TYPE_OPTIONS } from "@/lib/countries";
import { travelerSchema, travelSchema, declarationsSchema, contactSchema, evoaSchema, type Traveler, type Travel, type Declarations, type Evoa, type Product } from "@/lib/schema";
import { quote, money, PRICING, PRODUCT_LABELS } from "@/lib/pricing";
import { EVOA_PURPOSES, eligibility } from "@/lib/evoa";
import { hoursUntilArrival, isWindowGated, WINDOW_HOURS, windowState, type WindowState } from "@/lib/window";
import { ReminderForm } from "@/components/ReminderForm";
import { getAttribution, track } from "@/lib/analytics-client";

const emptyTraveler: Traveler = { givenNames: "", familyName: "", gender: "M", dateOfBirth: "", nationality: "", passportNumber: "", passportIssued: "", passportExpiry: "" };
const emptyTravel: Travel = { arrivalDate: "", departureDate: "", portOfEntry: "DPS", transportMode: "air", flightNumber: "", originCountry: "", purpose: PURPOSE_OPTIONS[0].value, visaType: VISA_TYPE_OPTIONS[0].value, accommodationName: "", accommodationAddress: "", accommodationCity: "" };
const emptyDecl: Declarations = { countriesVisited21d: [], symptoms: false, animalsPlants: false, cashOver100M: false, goodsOverAllowance: false, commercialGoods: false, registerImei: false, baggagePieces: 1, notes: "" };
const emptyContact = { email: "", phone: "", express: false, acceptTerms: false, acknowledgeNotGov: false };
const emptyEvoa: Evoa = { intendedEntryDate: "", purpose: "tourism", returnTicket: false, documents: [] };

const STEP_KEYS_AC = ["travelers", "travel", "declarations", "contact"] as const;
const STEP_KEYS_EV = ["travelers", "travel", "declarations", "evoaDocs", "contact"] as const;
const DECL_KEYS = ["symptoms", "animalsPlants", "cashOver100M", "goodsOverAllowance", "commercialGoods", "registerImei"] as const;

/** Errors are stored as English zod messages and translated at render time (see i18n/validation.ts). */
type Errors = Record<string, string>;
function flatten(err: z.ZodError): Errors {
  const out: Errors = {};
  for (const i of err.issues) out[i.path.join(".")] = i.message;
  return out;
}

export function ApplyForm({ initialProduct = "arrival_card", initialArrival = "", initialEmail = "" }: { initialProduct?: Product; initialArrival?: string; initialEmail?: string }) {
  const t = useTranslations("Apply");
  const tv = useTranslations("Validation");
  const to = useTranslations("Options");
  const tp = useTranslations("Products");
  const tc = useTranslations("Countries");
  const locale = useLocale();
  const m = (cents: number) => money(cents, PRICING.currency, intlLocale(locale));
  const countries = useMemo(() => localizedCountries((code) => (tc.has(code) ? tc(code) : undefined), intlLocale(locale)), [tc, locale]);

  const [product, setProduct] = useState<Product>(initialProduct);
  const [evoa, setEvoa] = useState<Evoa>(emptyEvoa);
  const [uploading, setUploading] = useState<string>("");
  const [step, setStep] = useState(0);
  const [travelers, setTravelers] = useState<Traveler[]>([{ ...emptyTraveler }]);
  const [travel, setTravel] = useState<Travel>({ ...emptyTravel, arrivalDate: initialArrival });
  const [decl, setDecl] = useState<Declarations>(emptyDecl);
  const [contact, setContact] = useState<typeof emptyContact>({ ...emptyContact, email: initialEmail });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showReminder, setShowReminder] = useState(false);
  const checkoutTracked = useRef(false); // begin_checkout once per form, not on every Back/Continue

  const q = useMemo(() => quote(travelers.length, contact.express, product), [travelers.length, contact.express, product]);
  const STEPS = product === "arrival_card" ? STEP_KEYS_AC : STEP_KEYS_EV;
  const last = STEPS.length - 1;
  const evoaStep = product === "arrival_card" ? -1 : 3;
  const contactStep = last;

  // 72-hour gate: the official portal only accepts arrival cards inside 72 h before arrival, so we do not take payment before then.
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(travel.arrivalDate);
  const hoursLeft = validDate ? hoursUntilArrival(travel.arrivalDate) : 0;
  const gate: WindowState = validDate && isWindowGated(product) ? windowState(hoursLeft) : "open";
  const gated = gate !== "open";

  /** English zod message → localized text. Anything else (server text, already localized strings) passes through. */
  function msg(raw: string) {
    const key = validationKey(raw);
    if (!key) return raw;
    return key === "documentsMissing" ? tv("documentsMissing", { list: messageList(raw) }) : tv(key);
  }

  async function upload(travelerIndex: number, kind: "passportScanId" | "photoId", file: File | undefined) {
    if (!file) return;
    setUploading(`${travelerIndex}-${kind}`);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErrors({ ...errors, [`documents.${travelerIndex}.${kind}`]: data.error ?? t("evoa.uploadFailed") }); return; }
      setEvoa((prev) => {
        const docs = prev.documents.filter((d) => d.travelerIndex !== travelerIndex);
        const cur = prev.documents.find((d) => d.travelerIndex === travelerIndex) ?? { travelerIndex, passportScanId: "", photoId: "" };
        return { ...prev, documents: [...docs, { ...cur, [kind]: data.id }] };
      });
      setErrors((e) => { const n = { ...e }; delete n[`documents.${travelerIndex}.${kind}`]; return n; });
    } finally { setUploading(""); }
  }

  function next() {
    let res: z.ZodSafeParseResult<unknown>;
    if (step === 0) res = z.array(travelerSchema).safeParse(travelers);
    else if (step === 1) res = travelSchema.safeParse(travel);
    else if (step === 2) res = declarationsSchema.safeParse(decl);
    else if (step === evoaStep) {
      res = evoaSchema.safeParse(evoa);
      if (res.success) {
        const missing = travelers.map((_, i) => i).filter((i) => !evoa.documents.some((d) => d.travelerIndex === i && d.passportScanId && d.photoId));
        if (missing.length) { setErrors({ documents: t("evoa.documentsMissing", { list: missing.map((i) => i + 1).join(", ") }) }); window.scrollTo({ top: 0, behavior: "smooth" }); return false; }
      }
    }
    else res = contactSchema.safeParse({ ...contact, locale });
    if (!res.success) { setErrors(flatten(res.error)); window.scrollTo({ top: 0, behavior: "smooth" }); return false; }
    if (step === 1 && gated) return false; // the reminder panel replaces Continue; belt and braces
    setErrors({});
    if (step < last) { setStep(step + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (step + 1 === last && !checkoutTracked.current) {
      checkoutTracked.current = true;
      const value = q.total / 100;
      const item = { item_id: product, item_name: PRODUCT_LABELS[product], quantity: q.travelers, price: Math.round((value / q.travelers) * 100) / 100 };
      track("begin_checkout", { currency: q.currency, value, items: [item] }, { meta: { event: "InitiateCheckout", params: { currency: q.currency, value, content_type: "product", content_ids: [product], num_items: q.travelers } } });
    }
    return true;
  }

  async function submit() {
    if (!next()) return;
    setBusy(true); setServerError("");
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product, travelers, travel, declarations: decl, evoa: product === "arrival_card" ? undefined : evoa, contact: { ...contact, locale }, attribution: getAttribution() }) });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? t("serverError"));
        if (data.issues) setErrors(flatten({ issues: data.issues } as z.ZodError));
        if (data.tooEarly || (typeof data.hoursLeft === "number" && data.hoursLeft < 0)) { setStep(1); setErrors({ arrivalDate: data.error }); window.scrollTo({ top: 0, behavior: "smooth" }); }
        setBusy(false); return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setServerError(t("networkError")); setBusy(false);
    }
  }

  const E = ({ k }: { k: string }) => (errors[k] ? <p className="error">{msg(errors[k])}</p> : null);
  const addPrice = product === "arrival_card" ? PRICING.arrivalCard.additional : product === "evoa" ? PRICING.evoa.additional + PRICING.evoa.governmentFee : PRICING.arrivalCard.additional + PRICING.evoa.additional + PRICING.evoa.governmentFee - PRICING.bundleDiscount;

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap gap-2 text-xs font-medium">
        {STEPS.map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${i === step ? "bg-brand-500 text-white" : i < step ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-ink-500"}`}>{t("stepLabel", { n: i + 1, label: t(`steps.${s}`) })}</li>)}
      </ol>

      <div className="card mt-4 border-brand-100 bg-brand-50">
        <div className="flex flex-wrap gap-2">
          {(["arrival_card", "evoa", "bundle"] as Product[]).map((p) => (
            <button key={p} type="button" onClick={() => { setProduct(p); setStep(0); setErrors({}); }} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${product === p ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-ink-700 ring-slate-200 hover:bg-brand-100"}`}>{tp(p)}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div className="text-sm text-ink-700">
            {t("summary.travelers", { count: q.travelers })} · {t("summary.serviceFee", { price: m(q.serviceFee) })}
            {q.governmentFee > 0 ? ` · ${t("summary.visaFee", { price: m(q.governmentFee) })}` : ""}
            {contact.express ? ` · ${t("summary.express", { price: m(q.extra) })}` : ""}
          </div>
          <div className="text-lg font-bold">{t("summary.total", { price: m(q.total) })}</div>
        </div>
      </div>

      {Object.keys(errors).length > 0 && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t("fixErrors")}</p>}

      {step === 0 && (
        <div className="mt-6 space-y-6">
          {travelers.map((tr, i) => (
            <fieldset key={i} className="card">
              <legend className="px-1 font-semibold">{t("traveler.legend", { n: i + 1 })}{i === 0 ? t("traveler.contactPerson") : ""}</legend>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label><span className="label">{t("traveler.familyName")}</span><input className="input" value={tr.familyName} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, familyName: e.target.value.toUpperCase() } : x))} /><E k={`${i}.familyName`} /></label>
                <label><span className="label">{t("traveler.givenNames")}</span><input className="input" value={tr.givenNames} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, givenNames: e.target.value.toUpperCase() } : x))} /><E k={`${i}.givenNames`} /></label>
                <label><span className="label">{t("traveler.gender")}</span><select className="input" value={tr.gender} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, gender: e.target.value as Traveler["gender"] } : x))}><option value="M">{to("gender.M")}</option><option value="F">{to("gender.F")}</option><option value="X">{to("gender.X")}</option></select></label>
                <label><span className="label">{t("traveler.dateOfBirth")}</span><input type="date" className="input" value={tr.dateOfBirth} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, dateOfBirth: e.target.value } : x))} /><E k={`${i}.dateOfBirth`} /></label>
                <label><span className="label">{t("traveler.nationality")}</span><select className="input" value={tr.nationality} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, nationality: e.target.value } : x))}><option value="">{t("select")}</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select><E k={`${i}.nationality`} /></label>
                <label><span className="label">{t("traveler.passportNumber")}</span><input className="input font-mono" autoCapitalize="characters" value={tr.passportNumber} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, passportNumber: e.target.value.toUpperCase().replace(/\s/g, "") } : x))} /><E k={`${i}.passportNumber`} /></label>
                <label><span className="label">{t("traveler.passportIssued")}</span><input type="date" className="input" value={tr.passportIssued} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, passportIssued: e.target.value } : x))} /><E k={`${i}.passportIssued`} /></label>
                <label><span className="label">{t("traveler.passportExpiry")}</span><input type="date" className="input" value={tr.passportExpiry} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, passportExpiry: e.target.value } : x))} /><E k={`${i}.passportExpiry`} /></label>
              </div>
              {i > 0 && <button type="button" className="mt-3 text-sm text-red-600 underline" onClick={() => setTravelers(travelers.filter((_, j) => j !== i))}>{t("traveler.remove")}</button>}
            </fieldset>
          ))}
          {product !== "arrival_card" && travelers.some((tr) => tr.nationality && eligibility(tr.nationality) !== "evoa") && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {travelers.filter((tr) => tr.nationality && eligibility(tr.nationality) === "visa_free").length > 0 && t("traveler.aseanVisaFree") + " "}
              {travelers.filter((tr) => tr.nationality && eligibility(tr.nationality) === "check").length > 0 && t("traveler.checkEligibility")}
            </p>
          )}
          {travelers.length < 10 && <button type="button" className="btn-secondary" onClick={() => setTravelers([...travelers, { ...emptyTraveler, nationality: travelers[0].nationality }])}>{t("traveler.add", { price: m(addPrice) })}</button>}
        </div>
      )}

      {step === 1 && (
        <div className="card mt-6 grid gap-4 md:grid-cols-2">
          <label><span className="label">{t("travel.arrivalDate")}</span><input type="date" className="input" value={travel.arrivalDate} onChange={(e) => setTravel({ ...travel, arrivalDate: e.target.value })} /><E k="arrivalDate" /><p className="mt-1 text-xs text-ink-500">{t("travel.arrivalHint")}</p></label>
          <label><span className="label">{t("travel.departureDate")}</span><input type="date" className="input" value={travel.departureDate} onChange={(e) => setTravel({ ...travel, departureDate: e.target.value })} /></label>
          <label><span className="label">{t("travel.transportMode")}</span><select className="input" value={travel.transportMode} onChange={(e) => setTravel({ ...travel, transportMode: e.target.value as Travel["transportMode"] })}><option value="air">{to("transport.air")}</option><option value="sea">{to("transport.sea")}</option><option value="land">{to("transport.land")}</option></select></label>
          <label><span className="label">{t("travel.portOfEntry")}</span><select className="input" value={travel.portOfEntry} onChange={(e) => setTravel({ ...travel, portOfEntry: e.target.value })}>{PORTS_OF_ENTRY.map((p) => <option key={p.code} value={p.code}>{to(`ports.${p.key}`)}</option>)}</select></label>
          <label><span className="label">{t("travel.flightNumber")}</span><input className="input" placeholder={t("travel.flightPlaceholder")} value={travel.flightNumber} onChange={(e) => setTravel({ ...travel, flightNumber: e.target.value.toUpperCase() })} /></label>
          <label><span className="label">{t("travel.originCountry")}</span><select className="input" value={travel.originCountry} onChange={(e) => setTravel({ ...travel, originCountry: e.target.value })}><option value="">{t("select")}</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select><E k="originCountry" /></label>
          <label><span className="label">{t("travel.purpose")}</span><select className="input" value={travel.purpose} onChange={(e) => setTravel({ ...travel, purpose: e.target.value })}>{PURPOSE_OPTIONS.map((p) => <option key={p.key} value={p.value}>{to(`purposes.${p.key}`)}</option>)}</select></label>
          <label><span className="label">{t("travel.visaType")}</span><select className="input" value={travel.visaType} onChange={(e) => setTravel({ ...travel, visaType: e.target.value })}>{VISA_TYPE_OPTIONS.map((p) => <option key={p.key} value={p.value}>{to(`visaTypes.${p.key}`)}</option>)}</select></label>
          <label className="md:col-span-2"><span className="label">{t("travel.accommodationName")}</span><input className="input" value={travel.accommodationName} onChange={(e) => setTravel({ ...travel, accommodationName: e.target.value })} /><E k="accommodationName" /></label>
          <label className="md:col-span-2"><span className="label">{t("travel.accommodationAddress")}</span><input className="input" value={travel.accommodationAddress} onChange={(e) => setTravel({ ...travel, accommodationAddress: e.target.value })} /><E k="accommodationAddress" /></label>
          <label><span className="label">{t("travel.accommodationCity")}</span><input className="input" placeholder={t("travel.cityPlaceholder")} value={travel.accommodationCity} onChange={(e) => setTravel({ ...travel, accommodationCity: e.target.value })} /><E k="accommodationCity" /></label>
        </div>
      )}

      {step === 2 && (
        <div className="card mt-6 space-y-4">
          <p className="text-sm text-ink-700">{t("declarations.intro")}</p>
          <label className="block"><span className="label">{t("declarations.countriesVisited")}</span>
            <select multiple className="input h-32" value={decl.countriesVisited21d} onChange={(e) => setDecl({ ...decl, countriesVisited21d: [...e.target.selectedOptions].map((o) => o.value) })}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
            <p className="mt-1 text-xs text-ink-500">{t("declarations.countriesHint")}</p></label>
          {DECL_KEYS.map((k) => (
            <label key={k} className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={decl[k]} onChange={(e) => setDecl({ ...decl, [k]: e.target.checked })} /><span className="text-sm">{t(`declarations.${k}`)}</span></label>
          ))}
          <label className="block max-w-xs"><span className="label">{t("declarations.baggagePieces")}</span><input type="number" min={0} max={30} className="input" value={decl.baggagePieces} onChange={(e) => setDecl({ ...decl, baggagePieces: Number(e.target.value) })} /></label>
          <label className="block"><span className="label">{t("declarations.notes")}</span><textarea className="input" rows={2} maxLength={500} value={decl.notes} onChange={(e) => setDecl({ ...decl, notes: e.target.value })} /></label>
        </div>
      )}

      {step === evoaStep && (
        <div className="card mt-6 space-y-5">
          <p className="text-sm text-ink-700">{t("evoa.intro")}</p>
          {errors.documents && <p className="error">{errors.documents}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="label">{t("evoa.intendedEntryDate")}</span><input type="date" className="input" value={evoa.intendedEntryDate} onChange={(e) => setEvoa({ ...evoa, intendedEntryDate: e.target.value })} /><E k="intendedEntryDate" /></label>
            <label><span className="label">{t("evoa.purpose")}</span><select className="input" value={evoa.purpose} onChange={(e) => setEvoa({ ...evoa, purpose: e.target.value as Evoa["purpose"] })}>{EVOA_PURPOSES.map((p) => <option key={p.value} value={p.value}>{to(`evoaPurposes.${p.value}`)}</option>)}</select></label>
          </div>
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={evoa.returnTicket} onChange={(e) => setEvoa({ ...evoa, returnTicket: e.target.checked })} /><span className="text-sm">{t("evoa.returnTicket")}</span></label>
          {travelers.map((tr, i) => {
            const d = evoa.documents.find((x) => x.travelerIndex === i);
            return (
              <fieldset key={i} className="rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold">{t("evoa.travelerLegend", { n: i + 1, familyName: tr.familyName || "—", givenNames: tr.givenNames })}</legend>
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <label><span className="label">{t("evoa.passportScan")} {d?.passportScanId && <span className="text-brand-600">{t("evoa.uploaded")}</span>}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input" disabled={uploading !== ""} onChange={(e) => upload(i, "passportScanId", e.target.files?.[0])} /><E k={`documents.${i}.passportScanId`} /></label>
                  <label><span className="label">{t("evoa.photo")} {d?.photoId && <span className="text-brand-600">{t("evoa.uploaded")}</span>}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="input" disabled={uploading !== ""} onChange={(e) => upload(i, "photoId", e.target.files?.[0])} /><E k={`documents.${i}.photoId`} /></label>
                </div>
              </fieldset>
            );
          })}
          {uploading && <p className="text-sm text-ink-500">{t("evoa.uploading")}</p>}
        </div>
      )}

      {step === contactStep && (
        <div className="card mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="label">{t("contact.email")}</span><input type="email" className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value.trim() })} /><E k="email" /></label>
            <label><span className="label">{t("contact.phone")}</span><input type="tel" className="input" placeholder={t("contact.phonePlaceholder")} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /><E k="phone" /></label>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" className="checkbox" checked={contact.express} onChange={(e) => setContact({ ...contact, express: e.target.checked })} /><span className="text-sm">{t.rich("contact.express", { expressHours: product === "arrival_card" ? PRICING.arrivalCard.expressSlaHours : PRICING.evoa.expressSlaHours, standardHours: product === "arrival_card" ? PRICING.arrivalCard.standardSlaHours : PRICING.evoa.standardSlaHours, price: m(PRICING.express), strong: (chunks) => <strong>{chunks}</strong> })}{product !== "arrival_card" ? " " + t("contact.expressEvoaNote") : ""}</span></label>
          <hr className="border-slate-200" />
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.acknowledgeNotGov} onChange={(e) => setContact({ ...contact, acknowledgeNotGov: e.target.checked })} /><span className="text-sm">{t("contact.acknowledgeNotGov")}</span></label>
          <E k="acknowledgeNotGov" />
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.acceptTerms} onChange={(e) => setContact({ ...contact, acceptTerms: e.target.checked })} /><span className="text-sm">{t.rich("contact.acceptTerms", {
            terms: (chunks) => <Link className="underline" href="/legal/terms" target="_blank">{chunks}</Link>,
            privacy: (chunks) => <Link className="underline" href="/legal/privacy" target="_blank">{chunks}</Link>,
            refunds: (chunks) => <Link className="underline" href="/legal/refunds" target="_blank">{chunks}</Link>,
          })}</span></label>
          <E k="acceptTerms" />
          {serverError && <p className="error">{serverError}</p>}
        </div>
      )}

      {step === 1 && gated && gate === "past" && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <p className="font-semibold">{t("gate.pastTitle")}</p>
          <p className="mt-1">{t("gate.pastText")}</p>
        </div>
      )}

      {step === 1 && gated && gate === "too_early" && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5" role="status">
          <p className="font-semibold text-amber-900">{t("gate.earlyTitle", { days: Math.round(hoursLeft / 24) })}</p>
          <p className="mt-2 text-sm text-ink-700">{t("gate.earlyText", { hours: WINDOW_HOURS, date: travel.arrivalDate })}</p>
          {product === "bundle" && !showReminder && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={() => { setProduct("evoa"); setStep(0); setErrors({}); }}>{t("gate.orderEvoa")}</button>
              <button type="button" className="btn-secondary" onClick={() => setShowReminder(true)}>{t("gate.setReminder")}</button>
            </div>
          )}
          {product === "bundle" && !showReminder && (
            <p className="mt-3 text-xs text-ink-500">{t("gate.evoaNote")}</p>
          )}
          {(product !== "bundle" || showReminder) && (
            <div className="mt-4">
              <ReminderForm compact initialArrival={travel.arrivalDate} initialEmail={contact.email} initialTravelers={travelers.length} initialNationality={travelers[0]?.nationality} product={product} />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>{t("back")}</button>
        {step === 1 && gated
          ? <span className="text-sm text-ink-500">{gate === "past" ? t("gate.changeDate") : t("gate.waitForWindow")}</span>
          : step < last
          ? <button type="button" className="btn-primary" onClick={next}>{t("continue")}</button>
          : <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? t("redirecting") : t("pay", { price: m(q.total) })}</button>}
      </div>
      <p className="mt-3 text-xs text-ink-500">{t("paymentNote")}</p>
    </div>
  );
}
