import type { Metadata } from "next";
import { site } from "@/lib/config";
import { WINDOW_HOURS } from "@/lib/window";
export const metadata: Metadata = { title: "Refund policy" };
export default function Page() {
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Refund policy</h1>
      <p className="mt-4 text-sm">Last updated: 2026-09-23.</p>
      <ul className="mt-4">
        <li><strong>Missed deadline:</strong> full refund, automatically, if your QR code is not delivered at least 6 hours before your scheduled arrival.</li>
        <li><strong>Cancellation before processing:</strong> full refund if you cancel before a team member has started your order. Email us with your order number.</li>
        <li><strong>Cancellation after processing:</strong> 50% refund if the card has not yet been submitted; no refund once the QR code has been delivered.</li>
        <li><strong>You no longer need the service:</strong> full refund if you tell us before we submit.</li>
        <li><strong>Ordered too early:</strong> we do not take payment for arrival cards more than {WINDOW_HOURS} hours before arrival. If a payment slips through, we hold the order and process it when the window opens, or refund in full on request before we start.</li>
        <li><strong>e-VOA visa fee:</strong> non-refundable once the application is lodged with the Indonesian authorities. Refunded in full if we have not yet lodged it.</li>
        <li><strong>e-VOA not eligible or refused:</strong> full refund of our service fee; the visa fee is refunded only if not yet lodged.</li>
        <li><strong>Our error:</strong> full refund plus a free resubmission if a mistake on our side causes the card to be rejected.</li>
      </ul>
      <p className="mt-4">Refunds are returned to the original card within 5–10 business days.</p>
      <p className="mt-4">If something goes wrong, contact us at <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> before opening a dispute with your bank. We answer within one business day and resolve almost every case with a refund or a resubmission. A chargeback opened without contacting us first may be contested with the order record, the delivery email and the <a href="/legal/terms">terms of service</a>.</p>
    </div>
  );
}
