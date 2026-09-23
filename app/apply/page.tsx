import type { Metadata } from "next";
import { ApplyForm } from "./ApplyForm";
import { DISCLOSURE } from "@/lib/config";
import { DATE_RE } from "@/lib/window";

export const metadata: Metadata = { title: "Apply – Indonesia arrival card assistance", description: "Guided form for the Indonesia arrival card. Transparent price shown first. Human-checked, delivered by email." };

export default async function Apply({ searchParams }: { searchParams: Promise<{ failed?: string; product?: string; arrival?: string; email?: string }> }) {
  const { failed, product, arrival, email } = await searchParams;
  const initialProduct = product === "evoa" || product === "bundle" ? product : "arrival_card";
  // Prefill from the reminder email link: /apply?arrival=YYYY-MM-DD&email=...
  const initialArrival = arrival && DATE_RE.test(arrival) ? arrival : "";
  const initialEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email.trim().toLowerCase() : "";
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{initialProduct === "arrival_card" ? "Arrival card assistance" : initialProduct === "evoa" ? "e-VOA assistance" : "e-VOA + arrival card"}</h1>
      <p className="mt-2 text-sm text-ink-500">{DISCLOSURE}</p>
      {failed && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Payment was not completed. Your details were not submitted. You can try again below.</p>}
      {initialArrival && <p className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-ink-700">Welcome back. Your arrival date ({initialArrival}){initialEmail ? " and email" : ""} are prefilled from your reminder.</p>}
      <ApplyForm initialProduct={initialProduct} initialArrival={initialArrival} initialEmail={initialEmail} />
    </div>
  );
}
