import type { Metadata } from "next";
import { site } from "@/lib/config";
export const metadata: Metadata = { title: "Privacy policy" };
export default function Page() {
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Privacy policy</h1>
      <p className="mt-4 text-sm">Template for legal review before launch. Last updated: 2026-09-23.</p>
      <h2>Controller</h2>
      <p>{site.company}, {site.address}. {site.companyReg}. Contact: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.</p>
      <h2>Data we collect</h2>
      <ul>
        <li>Identity and passport details of each traveler (name, date of birth, gender, nationality, passport number and dates), and for e-VOA orders a scan of the passport bio page and a passport-style photo.</li>
        <li>Travel details (dates, flight, port of entry, accommodation) and the health and customs declarations you make.</li>
        <li>Contact details (email, phone) and order records. Card details are processed by our payment provider and never stored by us.</li>
      </ul>
      <h2>Purpose and legal basis</h2>
      <p>To perform the contract you place with us: preparing and submitting your arrival card and delivering the result. Also to comply with legal obligations (accounting, fraud prevention) and, with your consent, to send service reminders.</p>
      <h2>Sharing</h2>
      <p>Your data is entered into the official Indonesian government portal to submit your arrival card. It is also processed by our hosting, database, email and messaging providers under data-processing agreements. We never sell personal data.</p>
      <h2>International transfers</h2>
      <p>Data is stored in Singapore and processed by our team in Hong Kong and Indonesia. Transfers are protected by contractual safeguards meeting the standards of Indonesia's Personal Data Protection Law and the GDPR.</p>
      <h2>Retention</h2>
      <p>Passport and declaration data, including uploaded passport scans and photos, is deleted 30 days after your arrival date. Order and payment records are kept for 7 years as required by accounting law, without passport data.</p>
      <h2>Your rights</h2>
      <p>You may request access, correction, deletion or a copy of your data, withdraw consent and lodge a complaint with a supervisory authority. Write to <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. We respond within 3 working days.</p>
      <h2>Security</h2>
      <p>Encryption in transit and at rest, role-based access for our team, audit logs, and breach notification to affected persons and authorities within the legally required period (3×24 hours under Indonesian law).</p>
      <h2>Cookies</h2>
      <p>We use Google Analytics 4 and the Meta (Facebook) Pixel, including their server-side interfaces (Google Analytics Measurement Protocol and Meta Conversions API), to measure visits and advertising conversions. For a completed order we send Google and Meta the order value and a hashed (irreversible) version of your email address, phone number, name and nationality, together with your IP address, browser identifier and advertising click identifiers, so that the advertising platforms can attribute the purchase to an advertisement. Nothing about your passport or your declarations is sent to them. You can opt out through the settings of those platforms or by using a browser that blocks their scripts.</p>
    </div>
  );
}
