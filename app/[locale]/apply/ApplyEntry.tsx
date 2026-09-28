"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApplyForm } from "./ApplyForm";
import { DATE_RE } from "@/lib/window";

type Product = "arrival_card" | "evoa" | "bundle";

/**
 * Reads the optional prefill query (?product=evoa|bundle, ?arrival=YYYY-MM-DD&email=… from the reminder
 * email, ?failed=1 after a cancelled payment) on the client so the /apply page itself stays static:
 * a static page ships its <title>/<meta description>/canonical in <head> (streamed metadata of a
 * dynamic page lands in <body>, which some crawlers ignore) and is bf-cache friendly.
 */
function Inner({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Apply");
  const sp = useSearchParams();
  const product = sp.get("product");
  const arrival = sp.get("arrival") ?? "";
  const email = sp.get("email") ?? "";
  const initialProduct: Product = product === "evoa" || product === "bundle" ? product : "arrival_card";
  const initialArrival = DATE_RE.test(arrival) ? arrival : "";
  const initialEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email.trim().toLowerCase() : "";
  return (
    <>
      <Title product={initialProduct} />
      {children}
      {sp.get("failed") && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t("paymentFailed")}</p>}
      {initialArrival && <p className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-ink-700">{t("welcomeBack", { date: initialArrival, withEmail: initialEmail ? "yes" : "no" })}</p>}
      <ApplyForm initialProduct={initialProduct} initialArrival={initialArrival} initialEmail={initialEmail} />
    </>
  );
}

function Title({ product }: { product: Product }) {
  const t = useTranslations("Apply");
  return <h1 className="text-3xl font-bold">{product === "arrival_card" ? t("titleArrivalCard") : product === "evoa" ? t("titleEvoa") : t("titleBundle")}</h1>;
}

export function ApplyEntry({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<><Title product="arrival_card" />{children}</>}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}
