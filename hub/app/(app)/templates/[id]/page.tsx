import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth";
import { getTemplate, parseSteps } from "@/lib/queries/templates";
import { PageHeader } from "@/components/PageHeader";
import { FlowBuilder } from "@/components/FlowBuilder";

export const metadata = { title: "Edit flow" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternal();
  const { id } = await params;
  const template = getTemplate(id);
  if (!template) notFound();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={template.name} description="Changes apply to future uses of this flow." />
      <FlowBuilder mode="template" template={{ id: template.id, name: template.name, description: template.description }} initialSteps={parseSteps(template.steps)} />
    </div>
  );
}
