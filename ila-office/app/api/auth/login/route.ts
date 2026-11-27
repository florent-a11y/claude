import { NextResponse } from "next/server";
import { z } from "zod";
import { clearPendingCookie, loginAllowed, recordLoginFailure, safeNext, setPendingCookie, setSessionCookie } from "@/lib/auth";
import { checkPassword, getTwoFactorPolicy, lockWait, twoFactorRequiredFor } from "@/lib/account-security";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(500), next: z.string().max(500).optional() });

/**
 * First step of sign-in. A right password signs in at once, unless the account has two-step sign-in (then the code
 * page comes first) or the policy requires it and the account has none (then the session only reaches its setup).
 */
export async function POST(req: Request) {
  const fd = await req.formData();
  const parsed = schema.safeParse({ email: fd.get("email"), password: fd.get("password"), next: fd.get("next") || undefined });
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url), 303);
  if (!parsed.success) return back("Enter your email and password.");
  const key = `${req.headers.get("x-forwarded-for") ?? "local"}:${parsed.data.email.toLowerCase()}`;
  if (!loginAllowed(key)) return back("Too many attempts. Try again in 15 minutes.");
  const result = await checkPassword(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    recordLoginFailure(key);
    return back(result.reason === "locked" ? `Too many wrong attempts: this account is locked for ${lockWait(result.until)}. An administrator can unlock it.` : "Wrong email or password.");
  }
  const next = safeNext(parsed.data.next);
  if (result.twoFactor) {
    await setPendingCookie(result.user.id);
    return NextResponse.redirect(new URL(`/login/verify${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`, req.url), 303);
  }
  await clearPendingCookie();
  const setupRequired = twoFactorRequiredFor(await getTwoFactorPolicy(), result.user.role);
  await setSessionCookie(result.user.id, { setupRequired });
  return NextResponse.redirect(new URL(setupRequired ? "/account/security?required=1" : next, req.url), 303);
}
