import type { Metadata } from "next";
export const metadata: Metadata = { title: "Refund policy" };
export default function Page() {
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Refund policy</h1>
      <ul className="mt-4">
        <li><strong>Missed deadline:</strong> full refund, automatically, if your QR code is not delivered at least 6 hours before your scheduled arrival.</li>
        <li><strong>Cancellation before processing:</strong> full refund if you cancel before a team member has started your order. Email us with your order number.</li>
        <li><strong>Cancellation after processing:</strong> 50% refund if the card has not yet been submitted; no refund once the QR code has been delivered.</li>
        <li><strong>You no longer need the service:</strong> full refund if you tell us before we submit.</li>
        <li><strong>e-VOA government fee:</strong> paid to the Indonesian authorities on your behalf and non-refundable once the application is lodged. Refunded in full if we have not yet lodged it.</li>
        <li><strong>e-VOA not eligible or refused:</strong> full refund of our service fee; the government fee is refunded only if not yet lodged.</li>
        <li><strong>Our error:</strong> full refund plus a free resubmission if a mistake on our side causes the card to be rejected.</li>
      </ul>
      <p className="mt-4">Refunds are returned to the original card within 5–10 business days. Please contact us before opening a dispute with your bank; we resolve almost every case within a day.</p>
    </div>
  );
}
