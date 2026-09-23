"use client";
import { useState } from "react";
import Link from "next/link";
import { countryList } from "@/lib/countries";
import { eligibility } from "@/lib/evoa";

export function EligibilityChecker() {
  const [c, setC] = useState("");
  const r = c ? eligibility(c) : null;
  return (
    <div className="card mt-6 max-w-xl">
      <label><span className="label">Nationality (passport country)</span>
        <select className="input" value={c} onChange={(e) => setC(e.target.value)}><option value="">Select…</option>{countryList.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></label>
      {r === "visa_free" && <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">ASEAN nationals enter Indonesia visa-free for 30 days. You do not need an e-VOA, only the <Link className="underline" href="/apply">arrival card</Link>.</p>}
      {r === "evoa" && <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">Eligible for the e-VOA. <Link className="font-semibold underline" href="/apply?product=evoa">Start your application</Link>.</p>}
      {r === "check" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your nationality may need a visa issued before travel rather than an e-VOA. <Link className="underline" href="/contact">Ask us</Link> and we will confirm within a few hours, free of obligation.</p>}
    </div>
  );
}
