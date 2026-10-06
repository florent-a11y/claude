import { requireInternal } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { TemplateEditor } from "../TemplateEditor";

export const metadata = { title: "New flow" };

export default async function NewTemplatePage() {
  await requireInternal();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New flow" description="Due dates are relative to the day the flow is applied." />
      <TemplateEditor />
    </div>
  );
}
