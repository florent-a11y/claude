import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/queries/workspaces";
import { listMessagesAfter } from "@/lib/queries/messages";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getWorkspaceForUser(id, user)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = new URL(req.url).searchParams.get("after") ?? "1970-01-01T00:00:00.000Z";
  return NextResponse.json({ messages: listMessagesAfter(id, user, after) }, { headers: { "Cache-Control": "no-store" } });
}
