import { listReminders } from "@/lib/store";
import { PRODUCT_LABELS } from "@/lib/pricing";
import { reminderStatus } from "@/lib/schema";
import { hoursUntilArrival } from "@/lib/window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const reminders = await listReminders({ limit: 5000 });
  const header = ["reminder_id", "created_at", "status", "email", "arrival_date", "hours_left", "travelers", "nationality", "product_interest", "locale", "source", "notified_early_at", "notified_at", "unsubscribed_at", "converted_order_id"];
  const rows = reminders.map((r) =>
    [r.id, r.createdAt, reminderStatus(r), r.email, r.arrivalDate, hoursUntilArrival(r.arrivalDate), r.travelers, r.nationality, PRODUCT_LABELS[r.productInterest], r.locale, r.source, r.notifiedEarlyAt, r.notifiedAt, r.unsubscribedAt, r.convertedOrderId].map(q).join(","),
  );
  const csv = [header.join(","), ...rows].join("\r\n");
  return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reminders-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
