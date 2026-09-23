import { NextResponse } from "next/server";
import { listDeliveredOrdersForReview, updateOrder } from "@/lib/store";
import { emailConfigured, reviewLinks, sendReviewRequest } from "@/lib/email";
import { arrivalInstant } from "@/lib/window";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The review request goes out between 2 and 14 days after arrival (counted from 00:00 Jakarta on the arrival date). */
const MIN_DAYS = 2;
const MAX_DAYS = 14;

/**
 * Cron (daily): asks delivered customers for a review 2 days after their arrival, once per order.
 * Orders whose arrival is more than 14 days ago are marked reviewSkipped and never emailed (no late nagging).
 * When email or the review links are not configured nothing is sent and nothing is marked.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await listDeliveredOrdersForReview(500);
  const configured = emailConfigured() && reviewLinks().length > 0;
  const now = Date.now();
  let candidates = 0, sent = 0, skipped = 0;
  const errors: string[] = [];

  for (const o of orders) {
    if (o.reviewRequestedAt || o.reviewSkipped) continue;
    const days = (now - arrivalInstant(o.travel.arrivalDate)) / 864e5;
    if (days < MIN_DAYS) continue; // too soon, try again tomorrow
    try {
      if (days > MAX_DAYS) {
        skipped += 1;
        if (configured) await updateOrder(o.id, { reviewSkipped: true });
        continue;
      }
      candidates += 1;
      if (!configured) { skipped += 1; continue; }
      const r = await sendReviewRequest(o);
      if (r.skipped) { skipped += 1; continue; }
      await updateOrder(o.id, { reviewRequestedAt: new Date().toISOString() });
      sent += 1;
    } catch (e) {
      errors.push(`${o.id}: ${(e as Error).message}`);
      console.error("[reviews/request]", o.id, (e as Error).message);
    }
  }

  return NextResponse.json({ candidates, sent, skipped, emailConfigured: emailConfigured(), reviewLinks: reviewLinks().length, errors: errors.length });
}
