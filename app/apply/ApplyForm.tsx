"use client";
import { useMemo, useState } from "react";
import { z } from "zod";
import { countryList, PORTS_OF_ENTRY, PURPOSES, VISA_TYPES } from "@/lib/countries";
import { travelerSchema, travelSchema, declarationsSchema, contactSchema, type Traveler, type Travel, type Declarations, type Contact } from "@/lib/schema";
import { quote, money, PRICING } from "@/lib/pricing";

const emptyTraveler: Traveler = { givenNames: "", familyName: "", gender: "M", dateOfBirth: "", nationality: "", passportNumber: "", passportIssued: "", passportExpiry: "" };
const emptyTravel: Travel = { arrivalDate: "", departureDate: "", portOfEntry: "DPS", transportMode: "air", flightNumber: "", originCountry: "", purpose: PURPOSES[0], visaType: VISA_TYPES[0], accommodationName: "", accommodationAddress: "", accommodationCity: "" };
const emptyDecl: Declarations = { countriesVisited21d: [], symptoms: false, animalsPlants: false, cashOver100M: false, goodsOverAllowance: false, commercialGoods: false, registerImei: false, baggagePieces: 1, notes: "" };
const emptyContact = { email: "", phone: "", whatsapp: true, express: false, acceptTerms: false, acknowledgeNotGov: false };

type Errors = Record<string, string>;
function flatten(err: z.ZodError): Errors {
  const out: Errors = {};
  for (const i of err.issues) out[i.path.join(".")] = i.message;
  return out;
}

const STEPS = ["Price & travelers", "Travel details", "Declarations", "Contact & pay"];

export function ApplyForm() {
  const [step, setStep] = useState(0);
  const [travelers, setTravelers] = useState<Traveler[]>([{ ...emptyTraveler }]);
  const [travel, setTravel] = useState<Travel>(emptyTravel);
  const [decl, setDecl] = useState<Declarations>(emptyDecl);
  const [contact, setContact] = useState<typeof emptyContact>(emptyContact);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");

  const q = useMemo(() => quote(travelers.length, contact.express), [travelers.length, contact.express]);

  function next() {
    let res: z.ZodSafeParseResult<unknown>;
    if (step === 0) res = z.array(travelerSchema).safeParse(travelers);
    else if (step === 1) res = travelSchema.safeParse(travel);
    else if (step === 2) res = declarationsSchema.safeParse(decl);
    else res = contactSchema.safeParse(contact);
    if (!res.success) { setErrors(flatten(res.error)); window.scrollTo({ top: 0, behavior: "smooth" }); return false; }
    setErrors({});
    if (step < 3) { setStep(step + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
    return true;
  }

  async function submit() {
    if (!next()) return;
    setBusy(true); setServerError("");
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ travelers, travel, declarations: decl, contact }) });
      const data = await res.json();
      if (!res.ok) { setServerError(data.error ?? "Something went wrong"); if (data.issues) setErrors(flatten({ issues: data.issues } as z.ZodError)); setBusy(false); return; }
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

      <div className="card mt-4 flex flex-wrap items-center justify-between gap-2 border-brand-100 bg-brand-50">
        <div className="text-sm text-ink-700">
          {q.travelers} traveler{q.travelers > 1 ? "s" : ""} · {money(PRICING.firstTraveler)} + {q.travelers - 1} × {money(PRICING.additionalTraveler)}{contact.express ? ` + express ${money(PRICING.express)}` : ""}
        </div>
        <div className="text-lg font-bold">Total {money(q.total)} <span className="text-xs font-normal text-ink-500">(all inclusive)</span></div>
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
          {travelers.length < 10 && <button type="button" className="btn-secondary" onClick={() => setTravelers([...travelers, { ...emptyTraveler, nationality: travelers[0].nationality }])}>+ Add traveler ({money(PRICING.additionalTraveler)})</button>}
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

      {step === 3 && (
        <div className="card mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="label">Email (the QR code is sent here)</span><input type="email" className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value.trim() })} /><E k="email" /></label>
            <label><span className="label">Mobile phone with country code</span><input type="tel" className="input" placeholder="+44 7…" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /><E k="phone" /></label>
          </div>
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.whatsapp} onChange={(e) => setContact({ ...contact, whatsapp: e.target.checked })} /><span className="text-sm">Also send my QR code by WhatsApp to this number</span></label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" className="checkbox" checked={contact.express} onChange={(e) => setContact({ ...contact, express: e.target.checked })} /><span className="text-sm"><strong>Express</strong> – human-verified and delivered in under {PRICING.expressSlaHours} hours (+{money(PRICING.express)}). Standard is under {PRICING.standardSlaHours} hours.</span></label>
          <hr className="border-slate-200" />
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.acknowledgeNotGov} onChange={(e) => setContact({ ...contact, acknowledgeNotGov: e.target.checked })} /><span className="text-sm">I understand this is a private assistance service and not a government website.</span></label>
          <E k="acknowledgeNotGov" />
          <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={contact.acceptTerms} onChange={(e) => setContact({ ...contact, acceptTerms: e.target.checked })} /><span className="text-sm">I accept the <a className="underline" href="/legal/terms" target="_blank">terms</a>, <a className="underline" href="/legal/privacy" target="_blank">privacy policy</a> and <a className="underline" href="/legal/refunds" target="_blank">refund policy</a>, and I am authorised to provide the details of all travelers in this booking.</span></label>
          <E k="acceptTerms" />
          {serverError && <p className="error">{serverError}</p>}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</button>
        {step < 3
          ? <button type="button" className="btn-primary" onClick={next}>Continue</button>
          : <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Redirecting to secure payment…" : `Pay ${money(q.total)} securely`}</button>}
      </div>
      <p className="mt-3 text-xs text-ink-500">Card payment is processed on a secure hosted page by our payment provider. We never see or store card numbers. The charge appears as our company name on your statement.</p>
    </div>
  );
}
