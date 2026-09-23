import type { Metadata } from "next";
import { CustomsCalculator } from "./Calculator";

export const metadata: Metadata = {
  title: "Indonesia customs allowances 2026: duty-free limits, cash, IMEI",
  description: "What you must declare when entering Indonesia: USD 500 personal goods allowance, alcohol and tobacco limits, IDR 100 million cash rule, phone IMEI registration.",
};

export default function Customs() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Indonesia customs allowances and what to declare</h1>
      <p className="mt-3 text-ink-700">Summary of the rules applied by Bea Cukai (Indonesian Customs) for arriving passengers. Always check the <a className="underline" href="https://www.beacukai.go.id/" target="_blank" rel="noopener nofollow">official customs site</a> for the latest figures.</p>
      <div className="prose-basic mt-6">
        <table>
          <thead><tr><th>Item</th><th>Allowance per adult passenger</th><th>If exceeded</th></tr></thead>
          <tbody>
            <tr><td>Personal goods (non-commercial)</td><td>USD 500 total value</td><td>Import duty and taxes on the excess</td></tr>
            <tr><td>Alcoholic beverages</td><td>1 litre</td><td>Excess is confiscated and destroyed</td></tr>
            <tr><td>Tobacco</td><td>200 cigarettes, or 25 cigars, or 100 g tobacco</td><td>Excess is confiscated and destroyed</td></tr>
            <tr><td>Cash and bearer instruments</td><td>Below IDR 100,000,000 (or equivalent)</td><td>Must be declared; penalties for non-declaration</td></tr>
            <tr><td>Mobile phones</td><td>Max 2 devices; IMEI registration required to use an Indonesian SIM beyond 90 days</td><td>Register at customs on arrival; tax may apply above allowance</td></tr>
            <tr><td>Animals, plants, fresh food</td><td>Requires quarantine declaration and permits</td><td>Confiscated; fines possible</td></tr>
            <tr><td>Drugs, weapons, pornography</td><td>Prohibited</td><td>Criminal prosecution</td></tr>
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 text-2xl font-bold">Quick check: do I need to declare?</h2>
      <CustomsCalculator />
    </div>
  );
}
