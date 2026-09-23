import { NextResponse } from "next/server";
import { getReminderByToken, updateReminder } from "@/lib/store";
import { site } from "@/lib/config";

export const runtime = "nodejs";

/** One-click unsubscribe from the reminder email. Redirects to /reminder with a confirmation. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const reminder = token ? await getReminderByToken(token) : null;
  if (!reminder) return NextResponse.redirect(`${site.url}/reminder?unsubscribed=0`, 302);
  if (!reminder.unsubscribedAt) await updateReminder(reminder.id, { unsubscribedAt: new Date().toISOString() });
  return NextResponse.redirect(`${site.url}/reminder?unsubscribed=1`, 302);
}
