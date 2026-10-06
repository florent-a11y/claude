import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth";
import { getTemplate, parseSteps } from "@/lib/queries/templates";
import { PageHeader } from "@/components/PageHeader";
import { TemplateEditor } from "../TemplateEditor";

export const metadata = { title: "Edit flow" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternal();
  const { id } = await params;
  const template = getTemplate(id);
  if (!template) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={template.name} description="Changes apply to future uses of this flow." />
      <TemplateEditor template={template} steps={parseSteps(template.steps)} />
    </div>
  );
}
