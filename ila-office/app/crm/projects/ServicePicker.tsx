"use client";
import { useState } from "react";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type ServiceCategory } from "@/lib/types";

type Svc = { id: string; name: string; category: ServiceCategory; code: string };

/** Service + category selects; choosing a catalogue service sets the category (which drives the checklist template). */
export function ServicePicker({ services, defaultServiceId = "", defaultCategory = "visa" }: { services: Svc[]; defaultServiceId?: string; defaultCategory?: ServiceCategory }) {
  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [category, setCategory] = useState<ServiceCategory>(defaultCategory);
  const grouped = SERVICE_CATEGORIES.map((c) => [c, services.filter((s) => s.category === c)] as const).filter(([, items]) => items.length);
  return (
    <>
      <label className="block"><span className="label">Catalogue service</span>
        <select name="serviceId" value={serviceId} className="input" onChange={(e) => { setServiceId(e.target.value); const s = services.find((x) => x.id === e.target.value); if (s) setCategory(s.category); }}>
          <option value="">— none / custom —</option>
          {grouped.map(([c, items]) => <optgroup key={c} label={SERVICE_CATEGORY_LABELS[c]}>{items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
        </select>
        <span className="mt-1 block text-xs text-ink-500">Sets the category and the checklist template (working KITAS, incorporation, due diligence…).</span>
      </label>
      <label className="block"><span className="label">Category</span>
        <select name="category" value={category} className="input" onChange={(e) => setCategory(e.target.value as ServiceCategory)}>
          {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>)}
        </select>
      </label>
    </>
  );
}
