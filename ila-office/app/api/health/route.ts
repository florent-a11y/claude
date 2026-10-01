import { storageBackend } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  return Response.json({ ok: true, storage: storageBackend(), time: new Date().toISOString() });
}
