import Link from "next/link";
import { redirect } from "next/navigation";
import { pendingUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Two-step sign-in · ILA Office" };

/** The second step: shown after a right password when the account has two-step sign-in. */
export default async function Verify({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  if (!(await pendingUserId())) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-700 p-6">
      <div className="card w-full max-w-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">ILA Global Consulting</p>
          <h1 className="text-xl font-bold">Two-step sign-in</h1>
          <p className="mt-1 text-xs text-ink-500">Open your authenticator app and type the 6-digit code it shows for ILA Office.</p>
        </div>
        {sp.error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{sp.error}</p>}
        <form method="post" action="/api/auth/verify" className="space-y-3">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <label className="block"><span className="label">Code</span>
            <input name="code" required autoFocus autoComplete="one-time-code" inputMode="text" maxLength={40} className="input text-center text-lg tracking-widest" placeholder="123 456" />
          </label>
          <button className="btn-primary w-full">Sign in</button>
        </form>
        <p className="mt-4 text-xs text-ink-500">No phone at hand? Type one of your recovery codes instead; each works once. If you have neither, ask an administrator to reset your two-step sign-in.</p>
        <p className="mt-2 text-xs"><Link href="/login" className="text-brand-600 underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
