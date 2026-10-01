import { hasAnyUser } from "@/lib/auth";
import { storageBackend } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · ILA Office" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const setup = !(await hasAnyUser());
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-700 p-6">
      <div className="card w-full max-w-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">ILA Global Consulting</p>
          <h1 className="text-xl font-bold">{setup ? "Create the first administrator" : "Sign in to ILA Office"}</h1>
          <p className="mt-1 text-xs text-ink-500">CRM · quotes · projects · books · tax · payroll</p>
        </div>
        {sp.error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{sp.error}</p>}
        {setup ? (
          <form method="post" action="/api/auth/setup" className="space-y-3">
            <label className="block"><span className="label">Name</span><input name="name" required className="input" autoComplete="name" /></label>
            <label className="block"><span className="label">Email</span><input name="email" type="email" required className="input" autoComplete="username" /></label>
            <label className="block"><span className="label">Password (10+ characters)</span><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></label>
            <button className="btn-primary w-full">Create account and sign in</button>
            <p className="text-xs text-ink-500">Storage: {storageBackend() === "supabase" ? "Supabase" : "local file (development)"}. Run <code>npm run seed</code> afterwards to load the service catalogue and ILA's own books.</p>
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
