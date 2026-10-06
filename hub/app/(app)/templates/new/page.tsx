import { requireInternal } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { FlowBuilder } from "@/components/FlowBuilder";

export const metadata = { title: "New flow" };

export default async function NewTemplatePage() {
  await requireInternal();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="New flow" description="Compose the steps of a standard engagement once, then apply it to any workspace." />
      <FlowBuilder mode="template" />
    </div>
  );
}
