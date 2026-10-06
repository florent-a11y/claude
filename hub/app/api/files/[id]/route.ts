import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser, isInternal } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { getFile } from "@/lib/queries/files";
import { getWorkspaceForUser } from "@/lib/queries/workspaces";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const file = getFile(id);
  if (!file || !getWorkspaceForUser(file.workspace_id, user)) return new NextResponse("Not found", { status: 404 });
  if (file.internal && !isInternal(user)) return new NextResponse("Not found", { status: 404 });
  const full = path.join(UPLOAD_DIR, file.storage_key);
  if (!fs.existsSync(full)) return new NextResponse("File missing on disk", { status: 410 });
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const stream = Readable.toWeb(fs.createReadStream(full)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
