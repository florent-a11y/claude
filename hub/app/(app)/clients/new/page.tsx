import { requireInternal } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireInternal();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New client" description="A client groups its contacts and workspaces. Notes stay internal." />
      <div className="card p-6"><ClientForm /></div>
    </div>
  );
}
