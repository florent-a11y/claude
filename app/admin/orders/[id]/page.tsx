import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store";
import { COUNTRIES, PORTS_OF_ENTRY } from "@/lib/countries";
import { money, PRODUCT_LABELS } from "@/lib/pricing";
import { EVOA_PURPOSES } from "@/lib/evoa";
import { site } from "@/lib/config";
import { OrderActions, CopyField, DeliverPanel } from "./Actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await getOrder(id);
  if (!o) notFound();
  const port = PORTS_OF_ENTRY.find((p) => p.code === o.travel.portOfEntry)?.name ?? o.travel.portOfEntry;
  const yes = (b: boolean) => (b ? "YES" : "No");
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order {o.id.slice(0, 8)}</h1>
          <p className="text-sm text-ink-500">{PRODUCT_LABELS[o.product]} · Created {new Date(o.createdAt).toLocaleString("en-GB")} · {money(o.amountCents, o.currency)}{o.governmentFeeCents > 0 ? ` (incl. ${money(o.governmentFeeCents, o.currency)} visa fee collected; pay IDR 500,000 + card charge on the e-VOA portal)` : ""} · {o.status}{o.contact.express ? " · EXPRESS" : ""}{o.reviewRequestedAt ? ` · review requested ${new Date(o.reviewRequestedAt).toLocaleDateString("en-GB")}` : ""}</p>
        </div>
        <div className="flex gap-2">{o.product !== "evoa" && <a className="btn-secondary !py-2 text-sm" href={site.officialPortal} target="_blank" rel="noopener">Arrival card portal ↗</a>}{o.product !== "arrival_card" && <a className="btn-secondary !py-2 text-sm" href="https://evisa.imigrasi.go.id/" target="_blank" rel="noopener">e-VOA portal ↗</a>}</div>
      </div>
      <OrderActions id={o.id} status={o.status} notes={o.opsNotes ?? ""} assignee={o.assignee ?? ""} acknowledgedAt={o.acknowledgedAt} activity={o.activity ?? []} orderJson={JSON.stringify(o)} />
      {o.status !== "pending_payment" && o.status !== "cancelled" && o.status !== "refunded" && <DeliverPanel id={o.id} email={o.contact.email} product={o.product} delivered={o.deliveredDocuments ?? []} />}

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Contact</h2>
          <CopyField label="Email (enter this in the official form so the traveler receives the QR)" value={o.contact.email} />
          <CopyField label="Phone" value={o.contact.phone} />
        </div>
        <div className="card">
          <h2 className="font-semibold">Travel</h2>
          <CopyField label="Arrival date" value={o.travel.arrivalDate} />
          <CopyField label="Departure date" value={o.travel.departureDate || "—"} />
          <CopyField label="Port of entry" value={port} />
          <CopyField label="Mode / flight" value={`${o.travel.transportMode} ${o.travel.flightNumber || ""}`.trim()} />
          <CopyField label="Origin country" value={COUNTRIES[o.travel.originCountry] ?? o.travel.originCountry} />
          <CopyField label="Purpose" value={o.travel.purpose} />
          <CopyField label="Visa type" value={o.travel.visaType} />
          <CopyField label="Accommodation" value={`${o.travel.accommodationName}, ${o.travel.accommodationAddress}, ${o.travel.accommodationCity}`} />
        </div>
      </section>

      <section className="mt-6 card">
        <h2 className="font-semibold">Declarations</h2>
        <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
          <p>Countries visited (21 d): {o.declarations.countriesVisited21d.map((c) => COUNTRIES[c] ?? c).join(", ") || "none"}</p>
          <p>Symptoms: {yes(o.declarations.symptoms)}</p>
          <p>Animals/plants/food: {yes(o.declarations.animalsPlants)}</p>
          <p>Cash ≥ IDR 100M: {yes(o.declarations.cashOver100M)}</p>
          <p>Goods over allowance: {yes(o.declarations.goodsOverAllowance)}</p>
          <p>Commercial goods: {yes(o.declarations.commercialGoods)}</p>
          <p>Register IMEI: {yes(o.declarations.registerImei)}</p>
          <p>Baggage pieces: {o.declarations.baggagePieces}</p>
        </div>
        {o.declarations.notes && <p className="mt-2 text-sm">Notes: {o.declarations.notes}</p>}
      </section>

      {o.evoa && (
        <section className="mt-6 card">
          <h2 className="font-semibold">e-VOA</h2>
          <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
            <p>Intended entry: {o.evoa.intendedEntryDate}</p>
            <p>Purpose: {EVOA_PURPOSES.find((p) => p.value === o.evoa!.purpose)?.label ?? o.evoa.purpose}</p>
            <p>Return ticket: {yes(o.evoa.returnTicket)}</p>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {o.evoa.documents.map((d) => (
              <li key={d.travelerIndex}>Traveler {d.travelerIndex + 1}: <a className="text-brand-600 underline" href={`/api/admin/documents/${d.passportScanId}`} target="_blank" rel="noopener">passport scan</a> · <a className="text-brand-600 underline" href={`/api/admin/documents/${d.photoId}`} target="_blank" rel="noopener">photo</a></li>
            ))}
          </ul>
        </section>
      )}

      {o.travelers.map((t, i) => (
        <section key={i} className="mt-6 card">
          <h2 className="font-semibold">Traveler {i + 1}</h2>
          <div className="grid gap-x-6 md:grid-cols-2">
            <CopyField label="Family name" value={t.familyName} />
            <CopyField label="Given names" value={t.givenNames} />
            <CopyField label="Gender" value={t.gender} />
            <CopyField label="Date of birth" value={t.dateOfBirth} />
            <CopyField label="Nationality" value={`${COUNTRIES[t.nationality] ?? t.nationality} (${t.nationality})`} />
            <CopyField label="Passport number" value={t.passportNumber} />
            <CopyField label="Passport issued" value={t.passportIssued} />
            <CopyField label="Passport expiry" value={t.passportExpiry} />
          </div>
        </section>
      ))}
    </div>
  );
}
