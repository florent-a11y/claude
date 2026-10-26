import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, loginAllowed, recordLoginFailure, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() });

export async function POST(req: Request) {
  const fd = await req.formData();
  const parsed = schema.safeParse({ email: fd.get("email"), password: fd.get("password"), next: fd.get("next") ?? undefined });
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url), 303);
  if (!parsed.success) return back("Enter your email and password.");
  const key = `${req.headers.get("x-forwarded-for") ?? "local"}:${parsed.data.email.toLowerCase()}`;
  if (!loginAllowed(key)) return back("Too many attempts. Try again in 15 minutes.");
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) { recordLoginFailure(key); return back("Wrong email or password."); }
  await setSessionCookie(user.id);
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  return NextResponse.redirect(new URL(next, req.url), 303);
}
