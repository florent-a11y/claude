import { redirect } from "next/navigation";
import { countUsers } from "@/lib/queries/users";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up" };

export default function SetupPage() {
  if (countUsers() > 0) redirect("/login");
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Set up your workspace</h1>
      <p className="mb-5 text-sm text-slate-500">Create the first administrator. You can invite the rest of the team afterwards.</p>
      <SetupForm />
    </>
  );
}
