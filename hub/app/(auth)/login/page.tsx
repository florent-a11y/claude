import { redirect } from "next/navigation";
import { countUsers } from "@/lib/queries/users";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (countUsers() === 0) redirect("/setup");
  const { next = "/" } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Welcome back</h1>
      <p className="mb-5 text-sm text-slate-500">Sign in with the account your team gave you.</p>
      <LoginForm next={next} />
    </>
  );
}
