import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { listWorkspaceApprovals } from "@/lib/queries/approvals";
import { listWorkspaceFiles } from "@/lib/queries/files";
import { EmptyState } from "@/components/EmptyState";
import { ApprovalCard } from "@/components/ApprovalCard";
import { ApprovalForm } from "./ApprovalForm";

export const metadata = { title: "Approvals" };

export default async function WorkspaceApprovalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const approvals = listWorkspaceApprovals(id);
  const pending = approvals.filter((a) => a.status === "pending");
  const closed = approvals.filter((a) => a.status !== "pending");
  const files = listWorkspaceFiles(id, user).map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-500">Ask a client or a colleague to sign off on a document or a decision. Decisions are logged in the conversation.</p>
        <ApprovalForm workspaceId={id} members={listMembers(id)} files={files} meId={user.id} />
      </div>
      {approvals.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No approvals yet" hint="Request an approval when you need a formal yes from the client, for example on a quotation or a final deliverable." />
      ) : (
        <>
          <div className="card">
            {pending.length ? <ul className="divide-y divide-slate-100">{pending.map((a) => <ApprovalCard key={a.id} a={a} user={user} />)}</ul> : <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing pending.</p>}
          </div>
          {closed.length > 0 && (
            <details className="card" open={pending.length === 0}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600">History ({closed.length})</summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">{closed.map((a) => <ApprovalCard key={a.id} a={a} user={user} />)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
