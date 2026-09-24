import { listReminders } from "@/lib/store";
import { PRODUCT_LABELS } from "@/lib/pricing";
import { reminderStatus } from "@/lib/schema";
import { hoursUntilArrival } from "@/lib/window";
import { csvResponse } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const reminders = await listReminders({ limit: 5000 });
  const header = ["reminder_id", "created_at", "status", "email", "arrival_date", "hours_left", "travelers", "nationality", "product_interest", "locale", "source", "notified_early_at", "notified_at", "unsubscribed_at", "converted_order_id"];
  const rows = reminders.map((r) =>
    [r.id, r.createdAt, reminderStatus(r), r.email, r.arrivalDate, hoursUntilArrival(r.arrivalDate), r.travelers, r.nationality, PRODUCT_LABELS[r.productInterest], r.locale, r.source, r.notifiedEarlyAt, r.notifiedAt, r.unsubscribedAt, r.convertedOrderId],
  );
  return csvResponse(header, rows, `reminders-${new Date().toISOString().slice(0, 10)}.csv`);
}
