import Link from "next/link";
import { listReminders } from "@/lib/store";
import { PRODUCT_LABELS } from "@/lib/pricing";
import { reminderStatus, type ReminderStatus } from "@/lib/schema";
import { hoursUntilArrival, PAST_HOURS, WINDOW_HOURS } from "@/lib/window";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reminder list", robots: { index: false, follow: false } };

const statusColor: Record<ReminderStatus, string> = {
  waiting: "bg-amber-100 text-amber-900", notified: "bg-blue-100 text-blue-900", unsubscribed: "bg-slate-200 text-slate-600", converted: "bg-green-100 text-green-900",
};
const STATUSES: ReminderStatus[] = ["waiting", "notified", "unsubscribed", "converted"];

export default async function AdminReminders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; past?: string }> }) {
  const sp = await searchParams;
  const all = await listReminders({ limit: 5000 });
  const q = (sp.q ?? "").trim().toLowerCase();
  let rows = all;
  if (!sp.past) rows = rows.filter((r) => hoursUntilArrival(r.arrivalDate) >= PAST_HOURS);
  if (sp.status) rows = rows.filter((r) => reminderStatus(r) === sp.status);
  if (q) rows = rows.filter((r) => [r.email, r.source, r.nationality, r.convertedOrderId].some((v) => v?.toLowerCase().includes(q)));
  rows.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate) || a.createdAt.localeCompare(b.createdAt));

  const upcoming = all.filter((r) => !r.unsubscribedAt && hoursUntilArrival(r.arrivalDate) > 0);
  const stats = {
    upcoming: upcoming.length,
    waiting: upcoming.filter((r) => reminderStatus(r) === "waiting").length,
    dueNow: upcoming.filter((r) => reminderStatus(r) === "waiting" && hoursUntilArrival(r.arrivalDate) <= WINDOW_HOURS).length,
    converted: all.filter((r) => r.convertedOrderId).length,
    travelers: upcoming.reduce((s, r) => s + r.travelers, 0),
  };
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(); for (const [k, v] of Object.entries({ status: sp.status, q: sp.q, past: sp.past, ...patch })) if (v) p.set(k, v);
    return `/admin/reminders?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link className="underline" href="/admin">Ops console</Link> / Reminder list</p>
          <h1 className="text-2xl font-bold">Reminder list</h1>
          <p className="text-sm text-ink-500">Travelers who arrive in more than {WINDOW_HOURS} h and asked to be emailed when the window opens. The cron at /api/reminders/notify sends the emails twice a day.</p>
        </div>
        <div className="flex gap-2 text-sm"><a className="btn-secondary !py-2" href="/api/admin/reminders/export">Export CSV</a></div>
      </div>
      {!emailConfigured() && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Email is off (set RESEND_API_KEY, EMAIL_FROM): reminders are collected but no email is sent and nothing is marked as notified.</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Upcoming", stats.upcoming, ""], ["Waiting", stats.waiting, "text-amber-700"], ["Window open, not yet emailed", stats.dueNow, "text-red-700"], ["Converted", stats.converted, "text-green-700"], ["Travelers (upcoming)", stats.travelers, ""]].map(([l, v, c]) => (
          <div key={String(l)} className="card !p-4"><p className="text-xs text-ink-500">{l}</p><p className={`text-2xl font-bold ${c}`}>{v}</p></div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-500">Status:</span>
        {STATUSES.map((s) => <Link key={s} href={link({ status: sp.status === s ? undefined : s })} className={`rounded-full px-2 py-0.5 text-xs ${sp.status === s ? "ring-2 ring-brand-500 " : ""}${statusColor[s]}`}>{s}</Link>)}
        <Link href={link({ past: sp.past ? undefined : "1" })} className={`rounded-full px-3 py-1 ring-1 ring-slate-200 ${sp.past ? "bg-brand-500 text-white" : "bg-white"}`}>{sp.past ? "Hiding past dates" : "Show past dates"}</Link>
        <form className="ml-auto flex gap-2" action="/admin/reminders">{sp.status && <input type="hidden" name="status" value={sp.status} />}<input name="q" defaultValue={sp.q} placeholder="Search email, source, order" className="input !py-1.5 text-sm" /><button className="btn-secondary !py-1.5 text-sm">Search</button></form>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500"><th className="py-2">Arrival</th><th>h left</th><th>Status</th><th>Email</th><th>Pax</th><th>Nat.</th><th>Interest</th><th>Source</th><th>Signed up</th><th>Heads-up</th><th>Notified</th><th>Order</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const h = hoursUntilArrival(r.arrivalDate);
              const st = reminderStatus(r);
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 whitespace-nowrap">{r.arrivalDate}</td>
                  <td className={h <= WINDOW_HOURS && h >= 0 ? "font-semibold text-green-700" : h < 0 ? "text-slate-400" : "text-ink-500"}>{h}</td>
                  <td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${statusColor[st]}`}>{st}</span></td>
                  <td className="text-xs">{r.email}</td>
                  <td>{r.travelers}</td>
                  <td className="text-xs">{r.nationality ?? <span className="text-ink-500">—</span>}</td>
                  <td className="text-xs">{PRODUCT_LABELS[r.productInterest]}</td>
                  <td className="text-xs">{r.source ?? <span className="text-ink-500">—</span>}</td>
                  <td className="whitespace-nowrap text-xs text-ink-500">{r.createdAt.slice(0, 10)}</td>
                  <td className="whitespace-nowrap text-xs text-ink-500">{r.notifiedEarlyAt?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs text-ink-500">{r.notifiedAt?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs">{r.convertedOrderId ? <Link className="text-brand-600 underline" href={`/admin/orders/${r.convertedOrderId}`}>{r.convertedOrderId.slice(0, 8).toUpperCase()}</Link> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="mt-6 text-ink-500">Nothing here.</p>}
      </div>
    </div>
  );
}
