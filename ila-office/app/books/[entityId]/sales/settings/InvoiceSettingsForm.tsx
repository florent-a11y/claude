"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SubmitButton } from "@/components/client";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { invoiceTotals } from "@/lib/ledger";
import {
  INVOICE_COLOR_PRESETS, INVOICE_LABELS, INVOICE_LANGUAGES, INVOICE_LANGUAGE_LABELS, INVOICE_PLACEHOLDERS, LOGO_HINT, LOGO_LIMIT, LOGO_SIZES, LOGO_TYPES, MAX_DUE_DAYS,
  automaticSettlementNotes, bankAccountLines, contrastRatio, defaultCompanyDetails, defaultFooterText, dueDateFor, invoiceDocument, parseHexColor, paymentTermText, resolveInvoiceSettings,
  type InvoiceLanguage, type LogoSize,
} from "@/lib/invoice-settings";
import type { Entity, Invoice, InvoiceSettings, TaxCode } from "@/lib/types";

export type SettingsEntity = Pick<Entity, "name" | "legalName" | "isOwn" | "tax" | "address" | "city" | "npwp">;
export interface BankLite { name: string; bankName?: string; accountNumber?: string; currency: string }

/** A text that follows an automatic value until the accountant writes their own. */
interface AutoText { auto: boolean; text: string }

function AutoField({ label, hint, name, rows, value, automatic, onChange, max }: { label: string; hint?: ReactNode; name: string; rows: number; value: AutoText; automatic: string; onChange: (v: AutoText) => void; max: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="label !mb-0">{label}</span>
        {value.auto ? <span className="text-xs text-ink-500">automatic</span> : <button type="button" className="text-xs text-brand-600 underline" onClick={() => onChange({ auto: true, text: "" })}>back to automatic</button>}
      </div>
      <textarea rows={rows} maxLength={max} className="input mt-1" value={value.auto ? automatic : value.text} onChange={(e) => onChange({ auto: false, text: e.target.value })} aria-label={label} />
      <input type="hidden" name={name} value={value.auto ? "" : value.text} />
      <input type="hidden" name={`${name}Auto`} value={value.auto ? "1" : "0"} />
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </div>
  );
}

function ColorField({ label, name, value, onChange, purpose }: { label: string; name: string; value: string; onChange: (v: string) => void; purpose: string }) {
  const valid = parseHexColor(value);
  const hint = valid && contrastRatio(valid, "#ffffff") < 3 ? "A light colour: text printed in it is darkened so it stays readable." : purpose;
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={valid ?? "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5" aria-label={`${label} picker`} />
        <input name={name} value={value} onChange={(e) => onChange(e.target.value)} className="input font-mono" placeholder="#0f3b5e" maxLength={7} aria-label={`${label} code`} />
      </div>
      <span className={`mt-1 block text-xs ${valid ? "text-ink-500" : "text-red-700"}`}>{valid ? hint : "Not a colour: use the picker or a code like #0f3b5e."}</span>
    </div>
  );
}

const auto = (stored: string | undefined): AutoText => (stored === undefined ? { auto: true, text: "" } : { auto: false, text: stored });

/**
 * Invoice settings with a live preview: the form on the left edits a draft of `Entity.invoiceSettings`, the page on
 * the right is the invoice as it will print (components/InvoiceDocument.tsx on a sample invoice). Nothing is stored
 * until "Save settings"; the logo travels with the same submit.
 */
export function InvoiceSettingsForm({ action, entity, settings, banks, logoUrl, today, currency }: {
  action: (fd: FormData) => Promise<void>;
  entity: SettingsEntity; settings: InvoiceSettings; banks: BankLite[]; logoUrl?: string; today: string; currency: string;
}) {
  const initial = useMemo(() => resolveInvoiceSettings({ ...entity, invoiceSettings: settings }), [entity, settings]);
  const [mainColor, setMainColor] = useState(initial.mainColor);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [tableHeader, setTableHeader] = useState(initial.tableHeader);
  const [logoSize, setLogoSize] = useState<LogoSize>(initial.logoSize);
  const [hideName, setHideName] = useState(Boolean(settings.hideCompanyName));
  const [companyDetails, setCompanyDetails] = useState(auto(settings.companyDetails));
  const [title, setTitle] = useState(settings.title ?? "");
  const [language, setLanguage] = useState<InvoiceLanguage>(initial.language);
  const [inclusive, setInclusive] = useState(initial.pricesIncludeTax);
  const [taxLabel, setTaxLabel] = useState(settings.taxLabel ?? "");
  const [noTaxNote, setNoTaxNote] = useState(auto(settings.noTaxNote));
  const [dueDays, setDueDays] = useState(String(initial.dueDays));
  const [dueKind, setDueKind] = useState(initial.dueDaysKind);
  const [showQty, setShowQty] = useState(initial.showQty);
  const [settlement, setSettlement] = useState(auto(settings.settlementNotes));
  const [defaultNotes, setDefaultNotes] = useState(settings.defaultNotes ?? "");
  const [footer, setFooter] = useState(auto(settings.footerText));
  const [sigShow, setSigShow] = useState(initial.signature.show);
  const [sigName, setSigName] = useState(initial.signature.name);
  const [sigTitle, setSigTitle] = useState(initial.signature.title);

  // Logo: the stored one, or the file just chosen (shown from memory until it is saved).
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ url: string; width: number; height: number; name: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);
  const clearPicked = () => { if (fileRef.current) fileRef.current.value = ""; setPicked(null); };
  const pickLogo = (file: File | undefined) => {
    setLogoError("");
    if (!file) { setPicked(null); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const refused = !LOGO_TYPES[ext] ? "The logo must be a PNG or JPG image." : file.size > LOGO_LIMIT ? `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${LOGO_LIMIT / 1024 / 1024} MB.` : "";
    if (refused) { clearPicked(); setLogoError(refused); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setPicked({ url, width: img.naturalWidth, height: img.naturalHeight, name: file.name }); setRemoveLogo(false); };
    img.onerror = () => { URL.revokeObjectURL(url); clearPicked(); setLogoError("This file is not an image the browser can read."); };
    img.src = url;
  };
  const storedLogo = removeLogo ? undefined : settings.logo;
  const hasLogo = Boolean(picked || storedLogo);
  const logoSrc = picked?.url ?? (storedLogo ? logoUrl : undefined);

  const days = Math.min(Math.max(Math.trunc(Number(dueDays)) || 0, 0), MAX_DUE_DAYS);
  // The draft exactly as it would be stored, so the preview and the automatic texts follow every keystroke.
  const draft: InvoiceSettings = {
    mainColor: parseHexColor(mainColor), accentColor: parseHexColor(accentColor), tableHeader, logoSize, hideCompanyName: hideName && hasLogo,
    logo: picked ? { id: "preview", name: picked.name, size: 0, type: "image/png", path: "preview", uploadedAt: today, width: picked.width, height: picked.height } : storedLogo,
    companyDetails: companyDetails.auto ? undefined : companyDetails.text, title: title.trim() || undefined, language,
    pricesIncludeTax: inclusive, taxLabel: taxLabel.trim() || undefined, noTaxNote: noTaxNote.auto ? undefined : noTaxNote.text,
    dueDays: days, dueDaysKind: dueKind, showQty, settlementNotes: settlement.auto ? undefined : settlement.text,
    defaultNotes: defaultNotes.trim() || undefined, footerText: footer.auto ? undefined : footer.text, signature: { show: sigShow, name: sigName, title: sigTitle },
  };
  const draftEntity = { ...entity, invoiceSettings: draft };
  const resolved = resolveInvoiceSettings(draftEntity);
  const automatic = {
    companyDetails: defaultCompanyDetails(entity), footer: defaultFooterText(entity), settlement: automaticSettlementNotes(draftEntity, banks, resolved),
    noTaxNote: entity.tax.pkp ? "" : INVOICE_LABELS[language].noTax,
  };

  const sample = useMemo<Invoice>(() => {
    const taxCode: TaxCode = entity.tax.pkp ? "ppn" : "out_of_scope";
    const lines = [{ description: "Monthly bookkeeping and tax reporting", qty: 1, unitPrice: 5_000_000, taxCode }, { description: "Company secretarial services", qty: 2, unitPrice: 1_250_000, taxCode }];
    const t = invoiceTotals(lines, { pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate, currency, pricesIncludeTax: inclusive });
    return {
      id: "sample", entityId: "sample", number: `INV-${today.slice(0, 4)}-0001`, customer: { type: "other", name: "PT Contoh Pelanggan", address: "Jl. Contoh No. 1, Denpasar, Bali", npwp: entity.tax.pkp ? "01.234.567.8-901.000" : undefined },
      date: today, dueDate: dueDateFor(today, { dueDays: days, dueDaysKind: dueKind }), currency, fxRate: 1,
      lines: lines.map((l, i) => ({ id: `l${i}`, ...l, amount: t.lineAmounts[i], grossAmount: t.pricesIncludeTax ? t.lineGross[i] : undefined, accountId: "sample" })),
      subtotal: t.subtotal, discount: t.discount, ppnAmount: t.ppnAmount, total: t.total, pricesIncludeTax: t.pricesIncludeTax || undefined, grossSubtotal: t.grossSubtotal, grossDiscount: t.grossDiscount, taxableBase: t.taxableBase,
      amountPaid: 0, status: "sent", notes: defaultNotes.trim() || undefined, createdAt: today,
    };
  }, [entity, currency, inclusive, today, days, dueKind, defaultNotes]);
  const doc = invoiceDocument({ invoice: sample, entity: draftEntity, banks });

  const insertBanks = () => {
    const lines = bankAccountLines(banks, entity.legalName || entity.name).join("\n");
    const current = settlement.auto ? automatic.settlement : settlement.text;
    setSettlement({ auto: false, text: current.trim() ? `${current.trimEnd()}\n${lines}` : lines });
  };
  const colorsValid = Boolean(parseHexColor(mainColor) && parseHexColor(accentColor));

  return (
    <form action={action} className="grid items-start gap-4 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Colours</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Colour presets">
            {INVOICE_COLOR_PRESETS.map((p) => {
              const active = parseHexColor(mainColor) === p.main && parseHexColor(accentColor) === p.accent;
              return (
                <button key={p.name} type="button" title={p.name} aria-label={p.name} aria-pressed={active} onClick={() => { setMainColor(p.main); setAccentColor(p.accent); }} className={`flex h-8 w-12 overflow-hidden rounded border-2 ${active ? "border-brand-600" : "border-slate-200 hover:border-slate-400"}`}>
                  <span className="h-full w-2/3" style={{ background: p.main }} /><span className="h-full w-1/3" style={{ background: p.accent }} />
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Main colour" name="mainColor" value={mainColor} onChange={setMainColor} purpose="Company name, title, table header, total." />
            <ColorField label="Accent colour" name="accentColor" value={accentColor} onChange={setAccentColor} purpose="Small labels and rules." />
          </div>
          <label className="block"><span className="label">Table header</span>
            <select name="tableHeader" value={tableHeader} onChange={(e) => setTableHeader(e.target.value === "solid" ? "solid" : "tinted")} className="input">
              <option value="tinted">Tinted with the main colour</option>
              <option value="solid">Filled with the main colour</option>
            </select>
          </label>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Logo and company details</h3>
          <div>
            <span className="label">Company logo</span>
            <input ref={fileRef} type="file" name="logo" accept=".png,.jpg,.jpeg,image/png,image/jpeg" className="input" onChange={(e) => pickLogo(e.target.files?.[0])} aria-label="Company logo file" />
            <span className={`mt-1 block text-xs ${logoError ? "text-red-700" : "text-ink-500"}`}>{logoError || (picked ? `${picked.name} (${picked.width} × ${picked.height} px) will be stored when you save.` : LOGO_HINT)}</span>
            {picked && <button type="button" className="mt-1 text-xs text-brand-600 underline" onClick={clearPicked}>Do not use this file</button>}
            {settings.logo && !picked && (
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" value="1" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} className="checkbox" /> Remove the current logo ({settings.logo.name})</label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Logo size</span>
              <select name="logoSize" value={logoSize} onChange={(e) => setLogoSize(e.target.value as LogoSize)} className="input" disabled={!hasLogo}>
                {LOGO_SIZES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
              </select>
              {!hasLogo && <input type="hidden" name="logoSize" value={logoSize} />}
            </label>
            <label className={`flex items-end gap-2 pb-2 text-sm ${hasLogo ? "" : "text-ink-500"}`}><input type="checkbox" name="hideCompanyName" value="1" checked={hideName && hasLogo} disabled={!hasLogo} onChange={(e) => setHideName(e.target.checked)} className="checkbox" /> The logo shows the name: hide the text</label>
          </div>
          <AutoField label="Company details under the name" name="companyDetails" rows={3} max={600} value={companyDetails} automatic={automatic.companyDetails} onChange={setCompanyDetails} hint="Automatic: the entity's address and NPWP. Add a phone number, an email or a website here." />
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Document</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Title</span><input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className="input" maxLength={40} placeholder={INVOICE_LABELS[language].title} /></label>
            <label className="block"><span className="label">Language of the labels</span>
              <select name="language" value={language} onChange={(e) => setLanguage(e.target.value === "id" ? "id" : "en")} className="input">{INVOICE_LANGUAGES.map((l) => <option key={l} value={l}>{INVOICE_LANGUAGE_LABELS[l]}</option>)}</select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showQty" value="1" checked={showQty} onChange={(e) => setShowQty(e.target.checked)} className="checkbox" /> Print the quantity and unit price columns</label>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Taxation</h3>
          {entity.tax.pkp ? (
            <label className="block"><span className="label">Prices on a new invoice are</span>
              <select name="pricesIncludeTax" value={inclusive ? "1" : "0"} onChange={(e) => setInclusive(e.target.value === "1")} className="input">
                <option value="0">Tax exclusive: PPN is added on top of the prices</option>
                <option value="1">Tax inclusive: the prices already include PPN</option>
              </select>
              <span className="mt-1 block text-xs text-ink-500">The default for new invoices; each invoice can still be switched. With inclusive prices the total is what you typed, and revenue and PPN output are posted from it ({Number((entity.tax.ppnRate * 100).toFixed(1))}% contained in the price).</span>
            </label>
          ) : (
            <p className="text-xs text-ink-500">This entity is not PKP, so its invoices carry no PPN and the choice between prices with or without tax does not apply. PKP status and the PPN rate are in the entity settings.<input type="hidden" name="pricesIncludeTax" value={inclusive ? "1" : "0"} /></p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Name of the tax</span><input name="taxLabel" value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} className="input" maxLength={24} placeholder="PPN" /><span className="mt-1 block text-xs text-ink-500">For example PPN, VAT or VAT (PPN).</span></label>
            <div>
              <div className="flex items-center justify-between gap-2"><span className="label !mb-0">When no tax is charged</span>{noTaxNote.auto ? <span className="text-xs text-ink-500">automatic</span> : <button type="button" className="text-xs text-brand-600 underline" onClick={() => setNoTaxNote({ auto: true, text: "" })}>automatic</button>}</div>
              <input value={noTaxNote.auto ? automatic.noTaxNote : noTaxNote.text} onChange={(e) => setNoTaxNote({ auto: false, text: e.target.value })} className="input mt-1" maxLength={120} placeholder="nothing printed" aria-label="Note when no tax is charged" />
              <input type="hidden" name="noTaxNote" value={noTaxNote.auto ? "" : noTaxNote.text} /><input type="hidden" name="noTaxNoteAuto" value={noTaxNote.auto ? "1" : "0"} />
              <span className="mt-1 block text-xs text-ink-500">Printed in the totals; empty prints nothing.</span>
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Payment and settlement notes</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Payment term (days)</span><input name="dueDays" type="number" min={0} max={MAX_DUE_DAYS} step={1} value={dueDays} onChange={(e) => setDueDays(e.target.value)} className="input" required /></label>
            <label className="block"><span className="label">Counted in</span>
              <select name="dueDaysKind" value={dueKind} onChange={(e) => setDueKind(e.target.value === "calendar" ? "calendar" : "working")} className="input"><option value="working">Working days (weekends skipped)</option><option value="calendar">Calendar days</option></select>
            </label>
          </div>
          <p className="text-xs text-ink-500">A new invoice is due {paymentTermText({ dueDays: days, dueDaysKind: dueKind })} after its date; the due date can be changed on each invoice.</p>
          <AutoField label="Settlement notes (bottom of the invoice)" name="settlementNotes" rows={6} max={2000} value={settlement} automatic={automatic.settlement} onChange={setSettlement}
            hint={<>Automatic: the payment term and the active bank accounts. A new invoice starts with this text and it can be changed there. {INVOICE_PLACEHOLDERS.map((p) => p.token).join(", ")} are replaced with the invoice&apos;s own.{banks.length > 0 && <> <button type="button" className="text-brand-600 underline" onClick={insertBanks}>Insert the bank accounts</button></>}</>} />
          <label className="block"><span className="label">Notes on a new invoice</span><textarea name="defaultNotes" rows={2} maxLength={2000} value={defaultNotes} onChange={(e) => setDefaultNotes(e.target.value)} className="input" placeholder="Terms, thanks, anything printed under the settlement notes" /></label>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Signature and footer</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="signatureShow" value="1" checked={sigShow} onChange={(e) => setSigShow(e.target.checked)} className="checkbox" /> Print a signature block</label>
          {sigShow && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Name</span><input name="signatureName" value={sigName} onChange={(e) => setSigName(e.target.value)} className="input" maxLength={80} /></label>
              <label className="block"><span className="label">Title</span><input name="signatureTitle" value={sigTitle} onChange={(e) => setSigTitle(e.target.value)} className="input" maxLength={80} placeholder="Director" /></label>
            </div>
          )}
          <AutoField label="Footer line" name="footerText" rows={2} max={300} value={footer} automatic={automatic.footer} onChange={setFooter} hint="Automatic: the company name and address. Empty prints no footer." />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton className={`btn-primary ${colorsValid ? "" : "pointer-events-none opacity-50"}`}>Save settings</SubmitButton>
          <span className="text-xs text-ink-500">Applies to the printed invoice and the PDF of every invoice of this entity, and to the defaults of new invoices.</span>
        </div>
      </div>

      <div className="min-w-0 xl:sticky xl:top-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Preview on a sample invoice</p>
        <div className="overflow-x-auto rounded border border-slate-200 bg-slate-100 p-3" data-testid="invoice-preview">
          <div className="mx-auto min-w-[560px] max-w-[760px] bg-white p-8 shadow-sm"><InvoiceDocument doc={doc} logoSrc={logoSrc} /></div>
        </div>
      </div>
    </form>
  );
}
