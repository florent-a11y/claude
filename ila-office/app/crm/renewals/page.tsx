import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPEN_RENEWAL_STATUSES, daysLeft, projectsNeedingRenewal, sortByExpiry } from "@/lib/crm";
import { todayISO } from "@/lib/dates";
import { RENEWAL_KINDS, RENEWAL_KIND_LABELS } from "@/lib/types";
import { Page, Stat, Chips, Notice, EmptyState, withParams, Field } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { lookups } from "../_lib/server";
import { RenewalsTable } from "../_components/tables";
import { generateRenewalsFromProjects, setRenewalStatus, updateRenewalExpiry } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Renewals" };
const STATUSES = ["upcoming", "reminded", "quoted", "renewed", "lapsed", "cancelled"] as const;

export default async function Renewals({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; generated?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [l, all, doneProjects] = await Promise.all([lookups(), db.list("renewals"), db.list("projects", { where: { status: "done" } })]);
  const today = todayISO();
  const write = can(me, "crm:write");
  const open = all.filter((r) => OPEN_RENEWAL_STATUSES.includes(r.status));
  const due30 = open.filter((r) => daysLeft(r.expiresAt, today) <= 30).length;
  const due60 = open.filter((r) => daysLeft(r.expiresAt, today) <= 60).length;
  const missing = projectsNeedingRenewal(doneProjects, all).length;
  const status = sp.status ?? "open";
  const rows = sortByExpiry(all.filter((r) => (status === "all" || (status === "open" ? OPEN_RENEWAL_STATUSES.includes(r.status) : r.status === status)) && (!sp.kind || r.kind === sp.kind)));
  const base = "/crm/renewals";
  const act = (id: string, s: (typeof STATUSES)[number], label: string, cls = "text-brand-600 underline") => <form key={s} action={setRenewalStatus.bind(null, id, s)} className="inline"><button className={cls}>{label}</button></form>;
  return (
    <Page title="Renewals" subtitle="KITAS, commercial address, nominee directors, licences, GMS and LKPM: everything that expires and must be re-quoted."
      actions={write && <>
        {missing > 0 && <form action={generateRenewalsFromProjects}><SubmitButton className="btn-secondary" pendingText="Generating…">Generate from projects ({missing})</SubmitButton></form>}
        <Link href="/crm/renewals/new" className="btn-primary">New renewal</Link>
      </>}>
      {sp.generated !== undefined && <div className="mb-3"><Notice tone="green">{sp.generated} renewal(s) created from completed projects.</Notice></div>}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Open renewals" value={open.length} />
        <Stat label="Due within 30 days" value={due30} tone={due30 ? "text-red-700" : ""} />
        <Stat label="Due within 60 days" value={due60} tone={due60 ? "text-amber-700" : ""} />
      </div>
      <div className="mb-3 space-y-2 no-print">
        <Chips items={[{ href: withParams(base, sp, { status: undefined }), label: `Open (${open.length})`, active: status === "open" }, ...STATUSES.map((s) => ({ href: withParams(base, sp, { status: s }), label: `${s} (${all.filter((r) => r.status === s).length})`, active: status === s })), { href: withParams(base, sp, { status: "all" }), label: "All", active: status === "all" }]} />
        <Chips items={[{ href: withParams(base, sp, { kind: undefined }), label: "All kinds", active: !sp.kind }, ...RENEWAL_KINDS.map((k) => ({ href: withParams(base, sp, { kind: k }), label: RENEWAL_KIND_LABELS[k].split(" /")[0].split(" (")[0], active: sp.kind === k }))]} />
      </div>
      {rows.length === 0 ? <EmptyState title="Nothing to renew here" hint="Renewals are created automatically when a project with an expiry date is marked done." /> : (
        <div className="card !p-3">
          <RenewalsTable renewals={rows} l={l} actions={write ? (r) => (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {r.status === "upcoming" && act(r.id, "reminded", "Reminded")}
              {(r.status === "upcoming" || r.status === "reminded") && <Link href={`/crm/quotes/new?renewalId=${r.id}`} className="text-brand-600 underline">Quote</Link>}
              {(r.status === "upcoming" || r.status === "reminded") && act(r.id, "quoted", "Mark quoted")}
              {r.status === "quoted" && !r.renewalProjectId && <Link href={`/crm/projects/new?renewalId=${r.id}`} className="text-brand-600 underline">Project</Link>}
              {OPEN_RENEWAL_STATUSES.includes(r.status) && act(r.id, "renewed", "Renewed", "text-green-800 underline")}
              {OPEN_RENEWAL_STATUSES.includes(r.status) && act(r.id, "lapsed", "Lapsed", "text-red-700 underline")}
              {OPEN_RENEWAL_STATUSES.includes(r.status) && act(r.id, "cancelled", "Cancel", "text-ink-500 underline")}
              {(r.status === "lapsed" || r.status === "cancelled" || r.status === "renewed") && act(r.id, "upcoming", "Reopen", "text-ink-500 underline")}
              <details className="inline"><summary className="cursor-pointer text-ink-500 underline">date</summary><form action={updateRenewalExpiry.bind(null, r.id)} className="mt-1 flex gap-1"><Field label=""><input type="date" name="expiresAt" defaultValue={r.expiresAt} className="input !w-36 !py-0.5 text-xs" /></Field><button className="btn-secondary !px-2 !py-0.5 text-xs">Set</button></form></details>
            </div>
          ) : undefined} />
        </div>
      )}
    </Page>
  );
}
