import type { Metadata } from "next";
import { ApplyForm } from "./ApplyForm";
import { DISCLOSURE } from "@/lib/config";

export const metadata: Metadata = { title: "Apply – Indonesia arrival card assistance", description: "Guided form for the Indonesia arrival card. Transparent price shown first. Human-checked, delivered by email and WhatsApp." };

export default async function Apply({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const { failed } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Arrival card assistance</h1>
      <p className="mt-2 text-sm text-ink-500">{DISCLOSURE}</p>
      {failed && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Payment was not completed. Your details were not submitted. You can try again below.</p>}
      <ApplyForm />
    </div>
  );
}
