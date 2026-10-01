import { NextResponse } from "next/server";
import { z } from "zod";
import { createFirstAdmin, hasAnyUser, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email(), name: z.string().min(1).max(80), password: z.string().min(10).max(200) });

export async function POST(req: Request) {
  if (await hasAnyUser()) return new NextResponse("Setup already completed", { status: 409 });
  const fd = await req.formData();
  const parsed = schema.safeParse({ email: fd.get("email"), name: fd.get("name"), password: fd.get("password") });
  if (!parsed.success) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("Use a valid email, a name and a password of at least 10 characters."), req.url), 303);
  const user = await createFirstAdmin(parsed.data);
  await setSessionCookie(user.id);
  return NextResponse.redirect(new URL("/", req.url), 303);
}
