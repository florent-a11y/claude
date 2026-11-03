import { guard } from "@/lib/auth";
import { isClient } from "@/lib/access";
import { isSafePath, readAttachment } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Served in the browser tab; everything else is downloaded (no HTML/SVG can be uploaded, see lib/files.ts). */
const INLINE_TYPES = /^(application\/pdf|image\/)/;

/**
 * Downloads a supporting document: /api/books/<entityId>/files/<entityId>/<docType>/<docId>/<id>-<name>.
 * The storage key must sit under the entity the user may see; anything else is a 404 (not a 403, so the route does not
 * confirm which keys exist).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ entityId: string; path: string[] }> }) {
  const { entityId, path: parts } = await ctx.params;
  // Directory files ("crm" scope) belong to no entity and are for the team only; everything else is entity-scoped.
  const user = entityId === "crm" ? await guard("read") : await guard("read", entityId);
  if (user instanceof Response) return user;
  if (entityId === "crm" && isClient(user)) return new Response("Not found", { status: 404 });
  const key = (parts ?? []).join("/");
  if (!isSafePath(key) || !key.startsWith(`${entityId}/`)) return new Response("Not found", { status: 404 });
  const file = await readAttachment(key);
  if (!file) return new Response("Not found", { status: 404 });
  const disposition = INLINE_TYPES.test(file.type) ? "inline" : "attachment";
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "content-type": file.type,
      "content-length": String(file.buffer.length),
      "content-disposition": `${disposition}; filename="${file.name.replace(/["\\]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
