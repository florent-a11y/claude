"use server";
import { requirePermission } from "@/lib/auth";
import { removeInvoiceLogo, resetInvoiceSettings, saveInvoiceSettings, setInvoiceLogo } from "@/lib/invoice-settings-services";
import type { InvoiceLanguage, LogoSize, NotesSize } from "@/lib/invoice-settings";
import { bool, num } from "@/lib/util";
import { act, base, withFlash } from "../../shared";

/** A text field as typed (not trimmed away to undefined: an empty text means "print nothing"). */
function raw(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
/** A text that follows its automatic value while `<key>Auto` is set. */
function autoText(fd: FormData, key: string): string | undefined {
  return bool(fd, `${key}Auto`) ? undefined : raw(fd, key);
}

/**
 * "Save settings": the logo first (a file that is refused leaves everything as it was), then the settings. The form
 * sends every field, so what is not ticked or filled goes back to its default.
 */
export async function saveInvoiceSettingsAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/sales/settings`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const file = fd.get("logo");
    const logo = typeof file === "object" && file !== null && "arrayBuffer" in file && (file as File).size > 0 ? (file as File) : undefined;
    if (logo) await setInvoiceLogo(entityId, logo, { id: user.id, name: user.name });
    else if (bool(fd, "removeLogo")) await removeInvoiceLogo(entityId, user.id);
    await saveInvoiceSettings(entityId, {
      mainColor: raw(fd, "mainColor"), accentColor: raw(fd, "accentColor"), tableHeader: raw(fd, "tableHeader") === "solid" ? "solid" : "tinted",
      logoSize: raw(fd, "logoSize") as LogoSize, hideCompanyName: bool(fd, "hideCompanyName"), companyDetails: autoText(fd, "companyDetails"),
      title: raw(fd, "title"), language: raw(fd, "language") as InvoiceLanguage,
      pricesIncludeTax: bool(fd, "pricesIncludeTax"), taxLabel: raw(fd, "taxLabel"), noTaxNote: autoText(fd, "noTaxNote"),
      dueDays: num(fd, "dueDays", 3), dueDaysKind: raw(fd, "dueDaysKind") === "calendar" ? "calendar" : "working", showQty: bool(fd, "showQty"),
      settlementNotes: autoText(fd, "settlementNotes"), defaultNotes: raw(fd, "defaultNotes"), footerText: autoText(fd, "footerText"),
      signature: { show: bool(fd, "signatureShow"), name: raw(fd, "signatureName"), title: raw(fd, "signatureTitle") },
      notesSize: raw(fd, "notesSize") as NotesSize,
    }, user.id);
    return withFlash(to, logo ? "Invoice settings and logo saved" : "Invoice settings saved");
  }, to);
}

export async function resetInvoiceSettingsAction(entityId: string) {
  const to = `${base(entityId)}/sales/settings`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    await resetInvoiceSettings(entityId, user.id);
    return withFlash(to, "Invoice settings put back to their defaults");
  }, to);
}
