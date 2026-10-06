import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isConversationMember, listDirectMessagesAfter } from "@/lib/queries/dm";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConversationMember(id, user.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = new URL(req.url).searchParams.get("after") ?? "1970-01-01T00:00:00.000Z";
  return NextResponse.json({ messages: listDirectMessagesAfter(id, after) }, { headers: { "Cache-Control": "no-store" } });
}
