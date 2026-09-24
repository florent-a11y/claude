"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

/** Declared outside the calculator so React keeps the same element type (and the input's focus) across re-renders. */
function Field({ label, value, set, step = 1 }: { label: string; value: number; set: (v: number) => void; step?: number }) {
  return (
    <label className="block"><span className="label">{label}</span><input className="input" type="number" min={0} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /></label>
  );
}

export function CustomsCalculator() {
  const t = useTranslations("Customs.calculator");
  const [goods, setGoods] = useState(0);
  const [alcohol, setAlcohol] = useState(0);
  const [cigs, setCigs] = useState(0);
  const [cashIdr, setCashIdr] = useState(0);
  const [phones, setPhones] = useState(1);
  const [bio, setBio] = useState(false);

  const flags: string[] = [];
  if (goods > 500) flags.push(t("flagGoods", { excess: goods - 500 }));
  if (alcohol > 1) flags.push(t("flagAlcohol"));
  if (cigs > 200) flags.push(t("flagCigarettes"));
  if (cashIdr >= 100_000_000) flags.push(t("flagCash"));
  if (phones > 2) flags.push(t("flagPhones"));
  if (bio) flags.push(t("flagBio"));

  return (
    <div className="card mt-4 grid gap-4 md:grid-cols-2">
      <Field label={t("goods")} value={goods} set={setGoods} step={10} />
      <Field label={t("alcohol")} value={alcohol} set={setAlcohol} step={0.1} />
      <Field label={t("cigarettes")} value={cigs} set={setCigs} step={20} />
      <Field label={t("cash")} value={cashIdr} set={setCashIdr} step={1_000_000} />
      <Field label={t("phones")} value={phones} set={setPhones} />
      <label className="flex items-start gap-3 md:col-span-2"><input type="checkbox" className="checkbox" checked={bio} onChange={(e) => setBio(e.target.checked)} /><span>{t("bio")}</span></label>
      <div className="md:col-span-2 rounded-lg bg-slate-50 p-4 text-sm">
        {flags.length === 0 ? <p className="text-brand-700">{t("nothing")}</p> : (
          <ul className="list-disc space-y-1 pl-5 text-amber-900">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
        <p className="mt-2 text-ink-500">{t("indicative")}</p>
      </div>
    </div>
  );
}
