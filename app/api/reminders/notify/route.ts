import { NextResponse } from "next/server";
import { listReminders, updateReminder } from "@/lib/store";
import { emailConfigured, sendReminderHeadsUp, sendReminderWindowOpen } from "@/lib/email";
import { hoursUntilArrival, PAST_HOURS, WINDOW_HOURS } from "@/lib/window";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron (twice a day): emails everyone on the reminder list whose 72-hour window has opened,
 * plus a short heads-up the day before. When email is not configured nothing is marked as sent.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pending = await listReminders({ due: true, limit: 2000 });
  const configured = emailConfigured();
  let due = 0, sent = 0, skipped = 0, headsUp = 0;
  const errors: string[] = [];

  for (const r of pending) {
    const h = hoursUntilArrival(r.arrivalDate);
    if (h < PAST_HOURS) continue; // arrival is in the past, nothing to send
    try {
      if (h <= WINDOW_HOURS) {
        due += 1;
        if (!configured) { skipped += 1; continue; }
        await sendReminderWindowOpen(r);
        await updateReminder(r.id, { notifiedAt: new Date().toISOString() });
        sent += 1;
      } else if (h <= WINDOW_HOURS + 24 && !r.notifiedEarlyAt) {
        if (!configured) { skipped += 1; continue; }
        await sendReminderHeadsUp(r);
        await updateReminder(r.id, { notifiedEarlyAt: new Date().toISOString() });
        headsUp += 1;
      }
    } catch (e) {
      errors.push(`${r.id}: ${(e as Error).message}`);
      console.error("[reminders/notify]", r.id, (e as Error).message);
    }
  }

  return NextResponse.json({ due, sent, skipped, headsUp, emailConfigured: configured, errors: errors.length });
}
