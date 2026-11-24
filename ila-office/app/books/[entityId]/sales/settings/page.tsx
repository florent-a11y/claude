import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { invoiceBanks, invoiceLogoUrl } from "@/lib/invoice-settings-services";
import { ConfirmForm } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../../shared";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";
import { resetInvoiceSettingsAction, saveInvoiceSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Invoice settings of an entity: colours, logo, title and language, prices with or without PPN, payment term,
 * settlement notes, signature and footer (lib/invoice-settings.ts). They shape the printable invoice and its PDF, and
 * give a new invoice its defaults; nothing already posted changes in the books.
 */
export default async function InvoiceSettingsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const banks = await invoiceBanks(entityId);
  const b = base(entityId);
  const customised = Object.entries(entity.invoiceSettings ?? {}).some(([k, v]) => v !== undefined && !["logo", "updatedAt", "updatedByUserId"].includes(k));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={`${b}/sales`} className="hover:underline">Sales</Link> / Invoice settings</p>
          <h2 className="text-base font-semibold">Invoice settings</h2>
          <p className="text-xs text-ink-500">How the invoices of {entity.name} look and what a new invoice starts with. The preview follows what you change; nothing is stored until you save.</p>
        </div>
        {customised && (
          <ConfirmForm action={resetInvoiceSettingsAction.bind(null, entityId)} message="Put every invoice setting back to its default? The logo is kept.">
            <button type="submit" className="btn-secondary">Reset to defaults</button>
          </ConfirmForm>
        )}
      </div>
      <InvoiceSettingsForm
        // A saved change gives a new key, so the form starts again from what is stored.
        key={entity.invoiceSettings?.updatedAt ?? "default"}
        action={saveInvoiceSettingsAction.bind(null, entityId)}
        entity={{ name: entity.name, legalName: entity.legalName, isOwn: entity.isOwn, tax: entity.tax, address: entity.address, city: entity.city, npwp: entity.npwp }}
        settings={entity.invoiceSettings ?? {}}
        banks={banks.map((x) => ({ name: x.name, bankName: x.bankName, accountNumber: x.accountNumber, currency: x.currency }))}
        logoUrl={invoiceLogoUrl(entity)}
        today={todayISO()}
        currency={entity.baseCurrency || "IDR"}
      />
    </div>
  );
}
