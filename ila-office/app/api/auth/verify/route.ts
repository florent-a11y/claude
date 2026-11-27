import { NextResponse } from "next/server";
import { clearPendingCookie, loginAllowed, pendingUserId, recordLoginFailure, safeNext, setSessionCookie } from "@/lib/auth";
import { checkSecondStep, lockWait } from "@/lib/account-security";

export const runtime = "nodejs";

/**
 * Second step of sign-in: the code of the authenticator app, or a recovery code. Only reachable with the short-lived
 * cookie the password step left; without it (expired, or never there) the person starts again at the sign-in page.
 */
export async function POST(req: Request) {
  const fd = await req.formData();
  const next = safeNext(typeof fd.get("next") === "string" ? (fd.get("next") as string) : undefined);
  const suffix = next !== "/" ? `&next=${encodeURIComponent(next)}` : "";
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  const userId = await pendingUserId();
  if (!userId) return to(`/login?error=${encodeURIComponent("That took too long. Sign in again.")}`);
  const code = typeof fd.get("code") === "string" ? (fd.get("code") as string).trim().slice(0, 40) : "";
  if (!code) return to(`/login/verify?error=${encodeURIComponent("Type the 6-digit code from your authenticator app.")}${suffix}`);
  const key = `${req.headers.get("x-forwarded-for") ?? "local"}:2fa:${userId}`;
  if (!loginAllowed(key)) return to(`/login/verify?error=${encodeURIComponent("Too many attempts. Try again in 15 minutes.")}${suffix}`);
  const result = await checkSecondStep(userId, code);
  if (!result.ok) {
    if (result.reason === "unavailable") { await clearPendingCookie(); return to("/login"); }
    recordLoginFailure(key);
    if (result.reason === "locked") { await clearPendingCookie(); return to(`/login?error=${encodeURIComponent(`Too many wrong attempts: this account is locked for ${lockWait(result.until)}. An administrator can unlock it.`)}`); }
    return to(`/login/verify?error=${encodeURIComponent("That code is not right. Codes change every 30 seconds: type the one showing now.")}${suffix}`);
  }
  await clearPendingCookie();
  await setSessionCookie(result.user.id);
  // A recovery code was spent: say how many are left, on the page where new ones are made.
  if (result.recoveryUsed) return to(`/account/security?ok=${encodeURIComponent(`Signed in with a recovery code. ${result.recoveryLeft} left: make new ones below if you are running low.`)}`);
  return to(next);
}
