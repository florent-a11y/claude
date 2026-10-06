import { requireInternal } from "@/lib/auth";
import { FlowBuilder } from "@/components/FlowBuilder";

export const metadata = { title: "New flow" };

export default async function NewTemplatePage() {
  await requireInternal();
  return (
    <FlowBuilder mode="template" />
  );
}
