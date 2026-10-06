import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { listAllPendingApprovals, listApprovalsByMe, listApprovalsForMe } from "@/lib/queries/approvals";
import { PageHeader } from "@/components/PageHeader";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const { view: v } = await searchParams;
  const internal = isInternal(user);
  const view = v === "requested" || (internal && v === "all") ? v : "mine";
  const list = view === "mine" ? listApprovalsForMe(user.id) : view === "requested" ? listApprovalsByMe(user.id) : listAllPendingApprovals();
  const tab = (key: string, label: string) => (
    <Link href={`/approvals?view=${key}`} className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{label}</Link>
  );
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Approvals" description="Sign-offs waiting on you, and the ones you asked for." />
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">{tab("mine", "Waiting on me")}{tab("requested", "Requested by me")}{internal && tab("all", "All pending")}</div>
      {list.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing to approve" hint={view === "mine" ? "You are all caught up." : "No approvals in this view."} />
      ) : (
        <ul className="card divide-y divide-slate-100">{list.map((a) => <ApprovalCard key={a.id} a={a} user={user} showWorkspace />)}</ul>
      )}
    </div>
  );
}
