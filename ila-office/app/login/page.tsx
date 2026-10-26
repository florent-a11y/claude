import { hasAnyUser } from "@/lib/auth";
import { storageCheck } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · ILA Office" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const check = await storageCheck();
  if (check.database !== "ok") {
    const why = check.database === "unconfigured" ? "No database is configured for this installation. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the hosting environment and redeploy."
      : check.database === "missing-schema" ? "The database is reachable but empty: run supabase/schema.sql in the Supabase SQL editor, then reload this page."
      : "The database did not answer. Check the Supabase project is running and the keys are correct.";
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-700 p-6">
        <div className="card w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">ILA Global Consulting</p>
          <h1 className="text-xl font-bold">ILA Office is not configured yet</h1>
          <p className="mt-3 text-sm text-ink-700">{why}</p>
          <p className="mt-3 text-xs text-ink-500">Step-by-step instructions are in DEPLOY.md in the repository. Once fixed, /api/health answers with database: ok.</p>
        </div>
      </main>
    );
  }
  const setup = !(await hasAnyUser());
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-700 p-6">
      <div className="card w-full max-w-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">ILA Global Consulting</p>
          <h1 className="text-xl font-bold">{setup ? "Create the first administrator" : "Sign in to ILA Office"}</h1>
          <p className="mt-1 text-xs text-ink-500">Clients · books · bank reconciliation · tax · payroll</p>
        </div>
        {sp.error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{sp.error}</p>}
        {setup ? (
          <form method="post" action="/api/auth/setup" className="space-y-3">
            <label className="block"><span className="label">Name</span><input name="name" required className="input" autoComplete="name" /></label>
            <label className="block"><span className="label">Email</span><input name="email" type="email" required className="input" autoComplete="username" /></label>
            <label className="block"><span className="label">Password (10+ characters)</span><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></label>
            <label className="flex items-start gap-2 text-xs text-ink-700"><input type="checkbox" name="demo" value="1" defaultChecked className="checkbox mt-0.5" /> Also create a fictional demo client (PT Demo Villa Investama) with its own books, so the team can practise. It can be deleted later.</label>
            <button className="btn-primary w-full">Create account and sign in</button>
            <p className="text-xs text-ink-500">This also loads ILA's own entity with its chart of accounts, the price list and the vendor list. Storage: {check.storage === "supabase" ? "Supabase" : "local file on this computer"}.</p>
          </form>
        ) : (
          <form method="post" action="/api/auth/login" className="space-y-3">
            <input type="hidden" name="next" value={sp.next ?? ""} />
            <label className="block"><span className="label">Email</span><input name="email" type="email" required className="input" autoComplete="username" /></label>
            <label className="block"><span className="label">Password</span><input name="password" type="password" required className="input" autoComplete="current-password" /></label>
            <button className="btn-primary w-full">Sign in</button>
          </form>
        )}
      </div>
    </main>
  );
}
