"use client";
import { useMemo, useState } from "react";
import { z } from "zod";
import { countryList, PORTS_OF_ENTRY, PURPOSES, VISA_TYPES } from "@/lib/countries";
import { travelerSchema, travelSchema, declarationsSchema, contactSchema, evoaSchema, type Traveler, type Travel, type Declarations, type Evoa, type Product } from "@/lib/schema";
import { quote, money, PRICING, PRODUCT_LABELS } from "@/lib/pricing";
import { EVOA_PURPOSES, eligibility } from "@/lib/evoa";
import { hoursUntilArrival, isWindowGated, WINDOW_HOURS, windowState, type WindowState } from "@/lib/window";
import { ReminderForm } from "@/components/ReminderForm";

const emptyTraveler: Traveler = { givenNames: "", familyName: "", gender: "M", dateOfBirth: "", nationality: "", passportNumber: "", passportIssued: "", passportExpiry: "" };
const emptyTravel: Travel = { arrivalDate: "", departureDate: "", portOfEntry: "DPS", transportMode: "air", flightNumber: "", originCountry: "", purpose: PURPOSES[0], visaType: VISA_TYPES[0], accommodationName: "", accommodationAddress: "", accommodationCity: "" };
const emptyDecl: Declarations = { countriesVisited21d: [], symptoms: false, animalsPlants: false, cashOver100M: false, goodsOverAllowance: false, commercialGoods: false, registerImei: false, baggagePieces: 1, notes: "" };
const emptyContact = { email: "", phone: "", express: false, acceptTerms: false, acknowledgeNotGov: false };
const emptyEvoa: Evoa = { intendedEntryDate: "", purpose: "tourism", returnTicket: false, documents: [] };

type Errors = Record<string, string>;
function flatten(err: z.ZodError): Errors {
  const out: Errors = {};
  for (const i of err.issues) out[i.path.join(".")] = i.message;
  return out;
}

function stepsFor(product: Product) {
  return product === "arrival_card"
    ? ["Price & travelers", "Travel details", "Declarations", "Contact & pay"]
    : ["Price & travelers", "Travel details", "Declarations", "e-VOA documents", "Contact & pay"];
}

export function ApplyForm({ initialProduct = "arrival_card", initialArrival = "", initialEmail = "" }: { initialProduct?: Product; initialArrival?: string; initialEmail?: string }) {
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

  const q = useMemo(() => quote(travelers.length, contact.express, product), [travelers.length, contact.express, product]);
  const STEPS = stepsFor(product);
  const last = STEPS.length - 1;
  const evoaStep = product === "arrival_card" ? -1 : 3;
  const contactStep = last;

  // 72-hour gate: the official portal only accepts arrival cards inside 72 h before arrival, so we do not take payment before then.
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(travel.arrivalDate);
  const hoursLeft = validDate ? hoursUntilArrival(travel.arrivalDate) : 0;
  const gate: WindowState = validDate && isWindowGated(product) ? windowState(hoursLeft) : "open";
  const gated = gate !== "open";

  async function upload(travelerIndex: number, kind: "passportScanId" | "photoId", file: File | undefined) {
    if (!file) return;
    setUploading(`${travelerIndex}-${kind}`);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErrors({ ...errors, [`documents.${travelerIndex}.${kind}`]: data.error ?? "Upload failed" }); return; }
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
        if (missing.length) { setErrors({ documents: `Please upload both files for traveler ${missing.map((i) => i + 1).join(", ")}` }); window.scrollTo({ top: 0, behavior: "smooth" }); return false; }
      }
    }
    else res = contactSchema.safeParse(contact);
    if (!res.success) { setErrors(flatten(res.error)); window.scrollTo({ top: 0, behavior: "smooth" }); return false; }
    if (step === 1 && gated) return false; // the reminder panel replaces Continue; belt and braces
    setErrors({});
    if (step < last) { setStep(step + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
    return true;
  }

  async function submit() {
    if (!next()) return;
    setBusy(true); setServerError("");
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product, travelers, travel, declarations: decl, evoa: product === "arrival_card" ? undefined : evoa, contact }) });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Something went wrong");
        if (data.issues) setErrors(flatten({ issues: data.issues } as z.ZodError));
        if (data.tooEarly || (typeof data.hoursLeft === "number" && data.hoursLeft < 0)) { setStep(1); setErrors({ arrivalDate: data.error }); window.scrollTo({ top: 0, behavior: "smooth" }); }
        setBusy(false); return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setServerError("Network error. Please try again."); setBusy(false);
    }
  }

  const E = ({ k }: { k: string }) => (errors[k] ? <p className="error">{errors[k]}</p> : null);

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap gap-2 text-xs font-medium">
        {STEPS.map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${i === step ? "bg-brand-500 text-white" : i < step ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-ink-500"}`}>{i + 1}. {s}</li>)}
      </ol>

      <div className="card mt-4 border-brand-100 bg-brand-50">
        <div className="flex flex-wrap gap-2">
          {(["arrival_card", "evoa", "bundle"] as Product[]).map((p) => (
            <button key={p} type="button" onClick={() => { setProduct(p); setStep(0); setErrors({}); }} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${product === p ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-ink-700 ring-slate-200 hover:bg-brand-100"}`}>{PRODUCT_LABELS[p]}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div className="text-sm text-ink-700">
            {q.travelers} traveler{q.travelers > 1 ? "s" : ""} · service fee {money(q.serviceFee)}
            {q.governmentFee > 0 ? ` · visa fee ${money(q.governmentFee)}` : ""}
            {contact.express ? ` · express ${money(q.extra)}` : ""}
          </div>
          <div className="text-lg font-bold">Total {money(q.total)}</div>
        </div>
      </div>

      {Object.keys(errors).length > 0 && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Please correct the highlighted fields.</p>}

      {step === 0 && (
        <div className="mt-6 space-y-6">
          {travelers.map((t, i) => (
            <fieldset key={i} className="card">
              <legend className="px-1 font-semibold">Traveler {i + 1}{i === 0 ? " (contact person)" : ""}</legend>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label><span className="label">Family name (as in passport)</span><input className="input" value={t.familyName} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, familyName: e.target.value.toUpperCase() } : x))} /><E k={`${i}.familyName`} /></label>
                <label><span className="label">Given names</span><input className="input" value={t.givenNames} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, givenNames: e.target.value.toUpperCase() } : x))} /><E k={`${i}.givenNames`} /></label>
                <label><span className="label">Gender</span><select className="input" value={t.gender} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, gender: e.target.value as Traveler["gender"] } : x))}><option value="M">Male</option><option value="F">Female</option><option value="X">Other / X</option></select></label>
                <label><span className="label">Date of birth</span><input type="date" className="input" value={t.dateOfBirth} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, dateOfBirth: e.target.value } : x))} /><E k={`${i}.dateOfBirth`} /></label>
                <label><span className="label">Nationality (passport country)</span><select className="input" value={t.nationality} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, nationality: e.target.value } : x))}><option value="">Select…</option>{countryList.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select><E k={`${i}.nationality`} /></label>
                <label><span className="label">Passport number</span><input className="input font-mono" autoCapitalize="characters" value={t.passportNumber} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, passportNumber: e.target.value.toUpperCase().replace(/\s/g, "") } : x))} /><E k={`${i}.passportNumber`} /></label>
                <label><span className="label">Passport issue date</span><input type="date" className="input" value={t.passportIssued} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, passportIssued: e.target.value } : x))} /><E k={`${i}.passportIssued`} /></label>
                <label><span className="label">Passport expiry date</span><input type="date" className="input" value={t.passportExpiry} onChange={(e) => setTravelers(travelers.map((x, j) => j === i ? { ...x, passportExpiry: e.target.value } : x))} /><E k={`${i}.passportExpiry`} /></label>
              </div>
              {i > 0 && <button type="button" className="mt-3 text-sm text-red-600 underline" onClick={() => setTravelers(travelers.filter((_, j) => j !== i))}>Remove traveler</button>}
            </fieldset>
          ))}
          {product !== "arrival_card" && travelers.some((t) => t.nationality && eligibility(t.nationality) !== "evoa") && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {travelers.filter((t) => t.nationality && eligibility(t.nationality) === "visa_free").length > 0 && "ASEAN nationals enter visa-free and do not need an e-VOA. "}
              {travelers.filter((t) => t.nationality && eligibility(t.nationality) === "check").length > 0 && "One nationality in this booking may not be e-VOA eligible; we will confirm before submitting and refund the service fee if not eligible."}
            </p>
          )}
          {travelers.length < 10 && <button type="button" className="btn-secondary" onClick={() => setTravelers([...travelers, { ...emptyTraveler, nationality: travelers[0].nationality }])}>+ Add traveler ({money(product === "arrival_card" ? PRICING.arrivalCard.additional : product === "evoa" ? PRICING.evoa.additional + PRICING.evoa.governmentFee : PRICING.arrivalCard.additional + PRICING.evoa.additional + PRICING.evoa.governmentFee - PRICING.bundleDiscount)})</button>}
        </div>
      )}

      {step === 1 && (
        <div className="card mt-6 grid gap-4 md:grid-cols-2">
          <label><span className="label">Arrival date in Indonesia</span><input type="date" className="input" value={travel.arrivalDate} onChange={(e) => setTravel({ ...travel, arrivalDate: e.target.value })} /><E k="arrivalDate" /><p className="mt-1 text-xs text-ink-500">We submit inside the official 72-hour window before this date.</p></label>
          <label><span className="label">Planned departure date (optional)</span><input type="date" className="input" value={travel.departureDate} onChange={(e) => setTravel({ ...travel, departureDate: e.target.value })} /></label>
          <label><span className="label">Mode of transport</span><select className="input" value={travel.transportMode} onChange={(e) => setTravel({ ...travel, transportMode: e.target.value as Travel["transportMode"] })}><option value="air">Air</option><option value="sea">Sea</option><option value="land">Land</option></select></label>
          <label><span className="label">Port of entry</span><select className="input" value={travel.portOfEntry} onChange={(e) => setTravel({ ...travel, portOfEntry: e.target.value })}>{PORTS_OF_ENTRY.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
          <label><span className="label">Flight / vessel number</span><input className="input" placeholder="e.g. GA715" value={travel.flightNumber} onChange={(e) => setTravel({ ...travel, flightNumber: e.target.value.toUpperCase() })} /></label>
          <label><span className="label">Country you are arriving from</span><select className="input" value={travel.originCountry} onChange={(e) => setTravel({ ...travel, originCountry: e.target.value })}><option value="">Select…</option>{countryList.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select><E k="originCountry" /></label>
          <label><span className="label">Purpose of visit</span><select className="input" value={travel.purpose} onChange={(e) => setTravel({ ...travel, purpose: e.target.value })}>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label><span className="label">Visa type</span><select className="input" value={travel.visaType} onChange={(e) => setTravel({ ...travel, visaType: e.target.value })}>{VISA_TYPES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="md:col-span-2"><span className="label">Accommodation name (hotel, villa, host)</span><input className="input" value={travel.accommodationName} onChange={(e) => setTravel({ ...travel, accommodationName: e.target.value })} /><E k="accommodationName" /></label>
          <label className="md:col-span-2"><span className="label">Address</span><input className="input" value={travel.accommodationAddress} onChange={(e) => setTravel({ ...travel, accommodationAddress: e.target.value })} /><E k="accommodationAddress" /></label>
          <label><span className="label">City / regency</span><input className="input" placeholder="e.g. Badung, Bali" value={travel.accommodationCity} onChange={(e) => setTravel({ ...travel, accommodationCity: e.target.value })} /><E k="accommodationCity" /></label>
        </div>
      )}

      {step === 2 && (
        <div className="card mt-6 space-y-4">
          <p className="text-sm text-ink-700">These answers go on your official declaration. Answering “yes” usually just means a short check on arrival; answering falsely is an offence.</p>
          <label className="block"><span className="label">Countries visited in the last 21 days (other than your home country)</span>
            <select multiple className="input h-32" value={decl.countriesVisited21d} onChange={(e) => setDecl({ ...decl, countriesVisited21d: [...e.target.selectedOptions].map((o) => o.value) })}>{countryList.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
            <p className="mt-1 text-xs text-ink-500">Hold Ctrl / Cmd to select several. Leave empty if none.</p></label>
          {([
            ["symptoms", "Anyone in this booking currently has fever, cough, breathing difficulty, rash or diarrhoea"],
            ["animalsPlants", "Carrying live animals, animal products, plants, seeds, fruit or fresh food"],
            ["cashOver100M", "Carrying cash or bearer instruments worth IDR 100,000,000 or more"],
            ["goodsOverAllowance", "Carrying goods above the personal allowance (USD 500 per person, 1 L alcohol, 200 cigarettes)"],
            ["commercialGoods", "Carrying goods for sale, samples or professional equipment"],
            ["registerImei", "I want to register a phone's IMEI for use with an Indonesian SIM card"],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={decl[k]} onChange={(e) => setDecl({ ...decl, [k]: e.target.checked })} /><span className="text-sm">{label}</span></label>
          ))}
          <label className="block max-w-xs"><span className="label">Pieces of checked baggage (total)</span><input type="number" min={0} max={30} className="input" value={decl.baggagePieces} onChange={(e) => setDecl({ ...decl, baggagePieces: Number(e.target.value) })} /></label>
          <label className="block"><span className="label">Anything we should know? (optional)</span><textarea className="input" rows={2} maxLength={500} value={decl.notes} onChange={(e) => setDecl({ ...decl, notes: e.target.value })} /></label>
        </div>
      )}

      {step === evoaStep && (
        <div className="card mt-6 space-y-5">
          <p className="text-sm text-ink-700">For the e-VOA we need, per traveler, a clear photo or scan of the passport bio page and a recent passport-style photo (plain background, no glasses, no hat). JPG, PNG or PDF, max 8 MB each.</p>
          {errors.documents && <p className="error">{errors.documents}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="label">Intended entry date</span><input type="date" className="input" value={evoa.intendedEntryDate} onChange={(e) => setEvoa({ ...evoa, intendedEntryDate: e.target.value })} /><E k="intendedEntryDate" /></label>
            <label><span className="label">Purpose of visit</span><select className="input" value={evoa.purpose} onChange={(e) => setEvoa({ ...evoa, purpose: e.target.value as Evoa["purpose"] })}>{EVOA_PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
          </div>
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={evoa.returnTicket} onChange={(e) => setEvoa({ ...evoa, returnTicket: e.target.checked })} /><span className="text-sm">I have (or will have) a return or onward ticket, which immigration may ask to see.</span></label>
          {travelers.map((t, i) => {
            const d = evoa.documents.find((x) => x.travelerIndex === i);
            return (
              <fieldset key={i} className="rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold">Traveler {i + 1}: {t.familyName || "—"} {t.givenNames}</legend>
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <label><span className="label">Passport bio page {d?.passportScanId && <span className="text-brand-600">✓ uploaded</span>}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input" disabled={uploading !== ""} onChange={(e) => upload(i, "passportScanId", e.target.files?.[0])} /><E k={`documents.${i}.passportScanId`} /></label>
                  <label><span className="label">Passport-style photo {d?.photoId && <span className="text-brand-600">✓ uploaded</span>}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="input" disabled={uploading !== ""} onChange={(e) => upload(i, "photoId", e.target.files?.[0])} /><E k={`documents.${i}.photoId`} /></label>
                </div>
              </fieldset>
            );
          })}
          {uploading && <p className="text-sm text-ink-500">Uploading…</p>}
        </div>
      )}

      {step === contactStep && (
        <div className="card mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="label">Email (the QR code is sent here)</span><input type="email" className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value.trim() })} /><E k="email" /></label>
            <label><span className="label">Mobile phone with country code (in case we need to reach you)</span><input type="tel" className="input" placeholder="+44 7…" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /><E k="phone" /></label>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" className="checkbox" checked={contact.express} onChange={(e) => setContact({ ...contact, express: e.target.checked })} /><span className="text-sm"><strong>Express</strong> – verified and submitted within {product === "arrival_card" ? PRICING.arrivalCard.expressSlaHours : PRICING.evoa.expressSlaHours} hours (+{money(PRICING.express)}). Standard is within {product === "arrival_card" ? PRICING.arrivalCard.standardSlaHours : PRICING.evoa.standardSlaHours} hours.{product !== "arrival_card" ? " e-VOA approval by the authorities usually follows the same day, at most 2 working days." : ""}</span></label>
          <hr className="border-slate-200" />
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.acknowledgeNotGov} onChange={(e) => setContact({ ...contact, acknowledgeNotGov: e.target.checked })} /><span className="text-sm">I understand this is a private assistance service and not a government website.</span></label>
          <E k="acknowledgeNotGov" />
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.acceptTerms} onChange={(e) => setContact({ ...contact, acceptTerms: e.target.checked })} /><span className="text-sm">I accept the <a className="underline" href="/legal/terms" target="_blank">terms</a>, <a className="underline" href="/legal/privacy" target="_blank">privacy policy</a> and <a className="underline" href="/legal/refunds" target="_blank">refund policy</a>, and I am authorised to provide the details of all travelers in this booking.</span></label>
          <E k="acceptTerms" />
          {serverError && <p className="error">{serverError}</p>}
        </div>
      )}

      {step === 1 && gated && gate === "past" && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <p className="font-semibold">This arrival date is in the past.</p>
          <p className="mt-1">The arrival card must be submitted before you arrive. Please check the date. If you are already in Indonesia, the card cannot be submitted any more and we cannot help with it.</p>
        </div>
      )}

      {step === 1 && gated && gate === "too_early" && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5" role="status">
          <p className="font-semibold text-amber-900">Too early for the arrival card: your arrival is about {Math.round(hoursLeft / 24)} days away.</p>
          <p className="mt-2 text-sm text-ink-700">The official portal only accepts arrival card submissions inside the {WINDOW_HOURS} hours before arrival. We do not take payment before then, so there is nothing to refund later. Leave your email and we will send you a message the moment the window opens for {travel.arrivalDate}; your details will be prefilled.</p>
          {product === "bundle" && !showReminder && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={() => { setProduct("evoa"); setStep(0); setErrors({}); }}>Order the e-VOA now</button>
              <button type="button" className="btn-secondary" onClick={() => setShowReminder(true)}>Set a reminder for the arrival card</button>
            </div>
          )}
          {product === "bundle" && !showReminder && (
            <p className="mt-3 text-xs text-ink-500">The e-VOA can be applied for up to 90 days ahead. You can order it now and come back for the arrival card when we email you.</p>
          )}
          {(product !== "bundle" || showReminder) && (
            <div className="mt-4">
              <ReminderForm compact initialArrival={travel.arrivalDate} initialEmail={contact.email} initialTravelers={travelers.length} initialNationality={travelers[0]?.nationality} product={product} />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</button>
        {step === 1 && gated
          ? <span className="text-sm text-ink-500">{gate === "past" ? "Change the arrival date to continue." : "Continue is available once the window is open."}</span>
          : step < last
          ? <button type="button" className="btn-primary" onClick={next}>Continue</button>
          : <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Redirecting to secure payment…" : `Pay ${money(q.total)} securely`}</button>}
      </div>
      <p className="mt-3 text-xs text-ink-500">Card payment is processed on a secure hosted page by our payment provider. We never see or store card numbers. The charge appears as our company name on your statement.</p>
    </div>
  );
}
