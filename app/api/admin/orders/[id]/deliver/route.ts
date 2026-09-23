import { NextResponse } from "next/server";
import { getOrder, updateOrder } from "@/lib/store";
import { storeDocument, ALLOWED, MAX_BYTES } from "@/lib/uploads";
import { sendDeliveryEmail, emailConfigured, type Attachment } from "@/lib/email";
import { onOrderUpdated } from "@/lib/notify";

export const runtime = "nodejs";

function actor(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Basic ") ? Buffer.from(h.slice(6), "base64").toString().split(":")[0] || "ops" : "ops";
}

/** multipart: files[] (QR PDF/images, e-VOA PDF), message (optional). Emails the customer, stores copies, marks delivered. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad form" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const message = String(form.get("message") ?? "").slice(0, 2000);
  if (files.length === 0) return NextResponse.json({ error: "Attach at least one file (QR code PDF or image)" }, { status: 422 });
  for (const f of files) {
    if (!ALLOWED.has(f.type)) return NextResponse.json({ error: `${f.name}: only JPG, PNG, WEBP or PDF` }, { status: 422 });
    if (f.size > MAX_BYTES) return NextResponse.json({ error: `${f.name}: larger than 8 MB` }, { status: 422 });
  }

  const attachments: Attachment[] = [];
  const stored: string[] = [];
  for (const f of files) {
    attachments.push({ filename: f.name, content: Buffer.from(await f.arrayBuffer()), contentType: f.type });
    stored.push((await storeDocument(f)).id);
  }

  let emailed = false;
  try {
    emailed = !(await sendDeliveryEmail(order, attachments, message)).skipped;
  } catch (e) {
    return NextResponse.json({ error: `Email failed, order not marked delivered: ${(e as Error).message}` }, { status: 502 });
  }

  const now = new Date().toISOString();
  const by = actor(req);
  const updated = await updateOrder(id, {
    status: "delivered",
    deliveredAt: now,
    acknowledgedAt: order.acknowledgedAt ?? now,
    deliveredDocuments: [...(order.deliveredDocuments ?? []), ...stored],
    activity: [...(order.activity ?? []), { at: now, by, action: emailed ? `delivered by email (${files.length} file${files.length > 1 ? "s" : ""})` : `marked delivered; email not sent (email service not configured)`, note: message || undefined }],
  });
  if (updated) await onOrderUpdated(updated);
  return NextResponse.json({ ok: true, emailed, configured: emailConfigured(), files: stored });
}
