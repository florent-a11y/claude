"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Landmark, QrCode } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import type { PayMethod } from "@/lib/schema";
import type { MethodInfo } from "@/lib/pay/methods";

interface Props {
  orderId: string;
  token: string;
  methods: MethodInfo[];
  bank: { bank: string; holder: string; number: string; sample: boolean } | null;
  totalLabel: string;
  /** "USD 84.35" for the card option, when a rate is configured. */
  cardCharge: string | null;
  /** The customer came back from a payment page without paying. */
  failed: boolean;
  /** The customer came back from a successful payment that is not confirmed yet: poll. */
  processing: boolean;
}

const ICONS: Record<PayMethod, typeof QrCode> = { xendit: QrCode, airwallex: CreditCard, transfer: Landmark, cod: Banknote };

/** Re-reads the order every few seconds while a payment is being confirmed. */
function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => { n += 1; router.refresh(); if (n >= 20) window.clearInterval(id); }, 4000);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}

export function PaymentPanel({ orderId, token, methods, bank, totalLabel, cardCharge, failed, processing }: Props) {
  const t = useTranslations("Order.pay");
  const router = useRouter();
  const [busy, setBusy] = useState<PayMethod | null>(null);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function choose(method: PayMethod) {
    setBusy(method);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, method }) });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string };
      if (!res.ok || !data.redirect) throw new Error("pay");
      window.location.assign(data.redirect);
    } catch {
      setError(t("errors.generic"));
      setBusy(null);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy("transfer");
    setError("");
    try {
      const body = new FormData();
      body.set("token", token);
      body.set("file", file);
      const res = await fetch(`/api/orders/${orderId}/proof`, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(t(`errors.${data.error === "too_large" || data.error === "bad_file" ? data.error : "generic"}`));
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError(t("errors.generic"));
      setBusy(null);
    }
  }

  if (processing) {
    return (
      <div role="status" className="rounded-2xl bg-sage-100 px-5 py-4 text-sm font-medium text-forest-900">
        <AutoRefresh />
        {t("processing")}
      </div>
    );
  }

  const copy: Record<PayMethod, { title: string; text: string }> = {
    xendit: { title: t("xendit"), text: t("xenditText") },
    airwallex: { title: t("airwallex"), text: `${t("airwallexText")}${cardCharge ? ` ${t("airwallexCharge", { amount: cardCharge })}` : ""}` },
    transfer: { title: t("transfer"), text: t("transferText") },
    cod: { title: t("cod"), text: t("codText") },
  };

  return (
    <section aria-labelledby="pay-title">
      <h2 id="pay-title" className="font-display text-3xl font-semibold text-forest-900">{t("title")}</h2>
      {failed && <p role="alert" className="mt-4 rounded-xl bg-clay-50 px-4 py-3 text-sm font-medium text-clay-600">{t("failed")}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
      <ul className="mt-5 space-y-3">
        {methods.map((m) => {
          const Icon = ICONS[m.method];
          return (
            <li key={m.method} className="rounded-2xl border border-sand-300 bg-white p-5">
              <div className="flex gap-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" strokeWidth={1.6} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-forest-900">{copy[m.method].title}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-700">{copy[m.method].text}</p>
                  {m.simulated && <p className="mt-1 text-xs font-medium text-clay-600">{t("simulated")}</p>}

                  {m.method === "transfer" && bank && (
                    <form onSubmit={upload} className="mt-4">
                      <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-sand-100 p-4 text-sm sm:grid-cols-2">
                        <div><dt className="text-xs uppercase tracking-wider text-ink-500">{t("bank")}</dt><dd className="font-semibold">{bank.bank}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wider text-ink-500">{t("holder")}</dt><dd className="font-semibold">{bank.holder}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wider text-ink-500">{t("number")}</dt><dd className="font-semibold tabular-nums">{bank.number}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wider text-ink-500">{t("amount")}</dt><dd className="font-semibold">{totalLabel}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wider text-ink-500">{t("reference")}</dt><dd className="font-semibold">{orderId}</dd></div>
                      </dl>
                      {bank.sample && <p className="mt-2 text-xs font-medium text-clay-600">{t("sampleBank")}</p>}
                      <label className="label mt-4" htmlFor="proof-file">{t("proof")}</label>
                      <input id="proof-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-ink-700 file:mr-4 file:rounded-full file:border-0 file:bg-sage-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-forest-900" />
                      <button type="submit" className="btn-primary btn-sm mt-4" disabled={!file || busy !== null}>{busy === "transfer" ? t("uploading") : t("upload")}</button>
                    </form>
                  )}
                  {m.method === "cod" && (
                    <button type="button" className="btn-secondary btn-sm mt-4" disabled={busy !== null} onClick={() => choose("cod")}>{t("codConfirm")}</button>
                  )}
                  {(m.method === "xendit" || m.method === "airwallex") && (
                    <button type="button" className="btn-primary btn-sm mt-4" disabled={busy !== null} onClick={() => choose(m.method)}>{busy === m.method ? t("redirecting") : t("payNow")}</button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
