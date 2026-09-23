"use client";
import { useState } from "react";

export function CustomsCalculator() {
  const [goods, setGoods] = useState(0);
  const [alcohol, setAlcohol] = useState(0);
  const [cigs, setCigs] = useState(0);
  const [cashIdr, setCashIdr] = useState(0);
  const [phones, setPhones] = useState(1);
  const [bio, setBio] = useState(false);

  const flags: string[] = [];
  if (goods > 500) flags.push(`Personal goods above the USD 500 allowance: duty applies on about USD ${goods - 500}.`);
  if (alcohol > 1) flags.push("Alcohol above 1 litre: the excess will be confiscated.");
  if (cigs > 200) flags.push("More than 200 cigarettes: the excess will be confiscated.");
  if (cashIdr >= 100_000_000) flags.push("Cash of IDR 100 million or more must be declared on the arrival card.");
  if (phones > 2) flags.push("More than 2 phones exceeds the passenger allowance; tax will be assessed.");
  if (bio) flags.push("Animals, plants or fresh food products must be declared for quarantine inspection.");

  const Field = ({ label, value, set, step = 1 }: { label: string; value: number; set: (v: number) => void; step?: number }) => (
    <label className="block"><span className="label">{label}</span><input className="input" type="number" min={0} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /></label>
  );

  return (
    <div className="card mt-4 grid gap-4 md:grid-cols-2">
      <Field label="Value of goods bought abroad (USD)" value={goods} set={setGoods} step={10} />
      <Field label="Alcohol (litres)" value={alcohol} set={setAlcohol} step={0.1} />
      <Field label="Cigarettes (sticks)" value={cigs} set={setCigs} step={20} />
      <Field label="Cash carried (IDR equivalent)" value={cashIdr} set={setCashIdr} step={1_000_000} />
      <Field label="Mobile phones carried" value={phones} set={setPhones} />
      <label className="flex items-start gap-3 md:col-span-2"><input type="checkbox" className="checkbox" checked={bio} onChange={(e) => setBio(e.target.checked)} /><span>I carry animals, plants, seeds, or fresh food products</span></label>
      <div className="md:col-span-2 rounded-lg bg-slate-50 p-4 text-sm">
        {flags.length === 0 ? <p className="text-brand-700">Nothing to declare based on these answers. Answer “no” to the customs questions on the arrival card.</p> : (
          <ul className="list-disc space-y-1 pl-5 text-amber-900">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
        <p className="mt-2 text-ink-500">Indicative only. Customs officers make the final decision.</p>
      </div>
    </div>
  );
}
