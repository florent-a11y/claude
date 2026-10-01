/**
 * Transactional email through Resend (the same service the arrival-card site uses). Nothing is sent unless
 * RESEND_API_KEY and EMAIL_FROM are set; callers check emailConfigured() and fall back to a mailto: link.
 */
export interface EmailAttachment { filename: string; content: Buffer; contentType?: string }
export interface EmailInput { to: string[]; cc?: string[]; bcc?: string[]; replyTo?: string; subject: string; text: string; html?: string; attachments?: EmailAttachment[] }

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? "";
}

/** Addresses copied on every outgoing invoice (e.g. the accounting mailbox), comma-separated in EMAIL_BCC. */
export function defaultBcc(): string[] {
  return (process.env.EMAIL_BCC ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/** Plain text → simple HTML paragraphs (blank line = new paragraph, single newline = line break). */
export function textToHtml(text: string): string {
  const paras = text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#15202b">${paras.join("")}</div>`;
}

export async function sendEmail(input: EmailInput): Promise<{ id?: string }> {
  if (!emailConfigured()) throw new Error("Email is not configured: set RESEND_API_KEY and EMAIL_FROM.");
  const to = input.to.map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) throw new Error("A recipient email address is required.");
  const body = {
    from: emailFrom(), to, cc: input.cc?.filter(Boolean), bcc: input.bcc?.filter(Boolean), reply_to: input.replyTo || process.env.EMAIL_REPLY_TO || undefined,
    subject: input.subject, text: input.text, html: input.html ?? textToHtml(input.text),
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })),
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Email service error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: data.id };
}

export function mailtoLink(to: string, subject: string, body: string, cc?: string): string {
  const p = new URLSearchParams();
  if (cc) p.set("cc", cc);
  p.set("subject", subject);
  p.set("body", body);
  return `mailto:${encodeURIComponent(to)}?${p.toString().replace(/\+/g, "%20")}`;
}
