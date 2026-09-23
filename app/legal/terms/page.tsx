import type { Metadata } from "next";
import { site } from "@/lib/config";
import { OfficialNote } from "@/components/OfficialNote";
import { PRICING } from "@/lib/pricing";
import { WINDOW_HOURS } from "@/lib/window";
export const metadata: Metadata = { title: "Terms of service" };
export default function Page() {
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Terms of service</h1>
      <p className="mt-4 text-sm">Template for review by a Hong Kong solicitor before launch. Last updated: 2026-09-23.</p>
      <h2>1. Parties and service</h2>
      <p>These terms govern the assistance service (the "Service") provided by {site.company} ("we", "us"), {site.jurisdiction} ({site.companyReg}) with its registered office at {site.address}, to the person placing an order ("you"). The Service consists of collecting your information through our guided form, checking it, submitting the Indonesia arrival card on the official government portal on your behalf, and delivering the resulting QR code to you.</p>
      <h2>2. Not a government service</h2>
      <p>We are not affiliated with, endorsed by or acting for the Government of Indonesia, and this website is not a government website. You are paying for our assistance only. We do not guarantee entry to Indonesia, which is at the sole discretion of Indonesian authorities.</p>
      <OfficialNote className="text-sm text-ink-500" />
      <h2>3. Price and payment</h2>
      <p>The price is displayed before you enter personal data and again at checkout. Payment is taken by card through our payment provider. The charge appears on your statement under our company descriptor, never as a government fee.</p>
      <h2>4. Your obligations</h2>
      <p>You must provide accurate information and hold authority to provide the information of other travelers in your booking. You remain responsible for the accuracy of the declarations (customs, health, immigration) made in your name.</p>
      <h2>5. Delivery and refunds</h2>
      <p>Standard delivery is within {PRICING.arrivalCard.standardSlaHours} hours for arrival cards and within {PRICING.evoa.standardSlaHours} hours for e-VOA verification; Express delivery is within {PRICING.arrivalCard.expressSlaHours} hours for arrival cards and within {PRICING.evoa.expressSlaHours} hours for e-VOA verification.</p>
      <p>Standard and Express delivery times run from the later of: (a) confirmation of your payment, (b) receipt of every detail and document we need, and (c) for arrival cards, the opening of the official {WINDOW_HOURS}-hour window. Express ({PRICING.arrivalCard.expressSlaHours} hours for arrival cards, {PRICING.evoa.expressSlaHours} hours for e-VOA verification) applies to our preparation and submission; the authorities' own processing time for the e-VOA is outside our control.</p>
      <p>If we do not deliver your arrival card QR code at least 6 hours before your scheduled arrival, you receive a full refund. See the <a href="/legal/refunds">refund policy</a>.</p>
      <h2>6. Orders placed too early</h2>
      <p>The official portal accepts arrival card submissions only within {WINDOW_HOURS} hours before arrival. Our order form does not take payment for arrival card assistance before that window opens; instead it offers a free reminder, and we email you when the window opens.</p>
      <p>If, despite this, an order is accepted outside the window (for example a bundle whose e-VOA part is processed immediately), the arrival card part is prepared as soon as the window opens, and the delivery times in section 5 count from that moment.</p>
      <p>If you change your arrival date, you must tell us before we submit. If a card is submitted for a date that you later change, a new submission is a new order.</p>
      <h2>7. Data protection</h2>
      <p>We process personal data as described in the <a href="/legal/privacy">privacy policy</a>, including the requirements of Indonesia's Law No. 27 of 2022 on Personal Data Protection, the Hong Kong Personal Data (Privacy) Ordinance and, where applicable, the GDPR.</p>
      <h2>8. Liability</h2>
      <p>Our total liability for any claim is limited to the amount you paid for the Service. We are not liable for refusal of entry, airline decisions, changes in government rules, or outages of the official portal, except where caused by our negligence.</p>
      <h2>9. Disputes and chargebacks</h2>
      <p>If something goes wrong, contact us at <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> before opening a dispute with your bank. We answer within one business day and resolve almost every case with a refund or a resubmission. A chargeback opened without contacting us first may be contested with the order record, the delivery email and this agreement.</p>
      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of Hong Kong SAR. Disputes are subject to the non-exclusive jurisdiction of the Hong Kong courts. Consumers keep any mandatory protections of their country of residence.</p>
    </div>
  );
}
