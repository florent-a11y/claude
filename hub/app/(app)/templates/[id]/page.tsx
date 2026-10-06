import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth";
import { getTemplate, parseSteps } from "@/lib/queries/templates";
import { getUser } from "@/lib/queries/users";
import { FlowBuilder } from "@/components/FlowBuilder";

export const metadata = { title: "Edit flow" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternal();
  const { id } = await params;
  const template = getTemplate(id);
  if (!template) notFound();
  const creatorName = template.created_by ? getUser(template.created_by)?.name ?? null : null;
  return (
    <FlowBuilder mode="template" template={{ id: template.id, name: template.name, description: template.description, created_at: template.created_at, creator_name: creatorName }} initialSteps={parseSteps(template.steps)} />
  );
}
