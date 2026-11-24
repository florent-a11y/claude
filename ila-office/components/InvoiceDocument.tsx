import type { CSSProperties } from "react";
import { logoDrawSize, type InvoiceDoc } from "@/lib/invoice-settings";

/**
 * The invoice as the customer sees it: the printable page and the live preview of the invoice settings both render
 * this from `invoiceDocument` (lib/invoice-settings.ts), and lib/invoice-pdf.ts lays out the same description, so the
 * three agree. Colours come from the settings, hence the inline styles; fills are kept when printing.
 *
 * No hooks and no server-only import: usable from a server page and from a client component alike.
 */
export function InvoiceDocument({ doc, logoSrc }: { doc: InvoiceDoc; logoSrc?: string }) {
  const c = doc.colors;
  const label: CSSProperties = { color: c.accentText, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" };
  const keepFill: CSSProperties = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };
  const th: CSSProperties = { padding: "7px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: c.headerText };
  const logo = doc.logo && logoSrc ? logoDrawSize(doc.logo) : undefined;
  return (
    <div className="invoice-doc text-sm" style={{ color: c.ink }}>
      <div className="flex items-start justify-between gap-6 pb-5" style={{ borderBottom: `2px solid ${c.rule}` }}>
        <div className="min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind the session, not an optimisable asset */}
          {logo && <img src={logoSrc} alt={doc.company.name} style={{ width: logo.width, height: logo.height, objectFit: "contain", objectPosition: "left top", marginBottom: 8 }} />}
          {doc.company.showName && <p className="text-xl font-bold leading-tight" style={{ color: c.mainText }}>{doc.company.name}</p>}
          {doc.company.tagline && <p style={{ color: c.accentText, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>{doc.company.tagline}</p>}
          {doc.company.details.map((line, i) => <p key={i} className="text-xs" style={{ color: c.grey }}>{line}</p>)}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-wide" style={{ color: c.mainText }}>{doc.title}</p>
          <p className="text-sm font-semibold">{doc.number}</p>
          {doc.stamp && <p className="text-xs font-bold" style={{ color: doc.stamp === "VOID" || doc.stamp === "BATAL" ? "#b91c1c" : c.grey }}>{doc.stamp}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 py-5">
        <div className="min-w-0">
          <p style={label}>{doc.billTo.label}</p>
          <p className="font-semibold">{doc.billTo.name}</p>
          {doc.billTo.lines.map((line, i) => <p key={i} style={{ color: c.grey }}>{line}</p>)}
        </div>
        <div className="grid grid-cols-[max-content_max-content] gap-x-4 gap-y-1 self-start justify-self-end">
          {doc.meta.map((m) => <div key={m.label} className="contents"><span style={{ color: c.grey }}>{m.label}</span><span className={m.strong ? "font-semibold" : ""}>{m.value}</span></div>)}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: c.headerFill, ...keepFill }}>
            <th style={{ ...th, textAlign: "left" }}>{doc.columns.description}</th>
            {doc.showQty && <th style={{ ...th, textAlign: "right" }}>{doc.columns.qty}</th>}
            {doc.showQty && <th style={{ ...th, textAlign: "right" }}>{doc.columns.unitPrice}</th>}
            <th style={{ ...th, textAlign: "right" }}>{doc.columns.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td className="py-2 pl-2 pr-3 align-top">{l.description}</td>
              {doc.showQty && <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums">{l.qty}</td>}
              {doc.showQty && <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums">{l.unitPrice}</td>}
              <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums">{l.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-80 max-w-full space-y-1 pr-2">
        {doc.totals.map((t, i) => (
          <div key={i} className={`flex justify-between gap-4 ${t.kind === "total" ? "pt-2 text-base font-bold" : t.kind === "muted" ? "text-xs" : ""}`} style={t.kind === "total" ? { borderTop: `2px solid ${c.main}`, color: c.mainText } : undefined}>
            <span style={t.kind === "total" ? undefined : { color: c.grey }}>{t.label}</span>
            <span className="text-right tabular-nums" style={t.kind === "total" ? { color: c.ink } : t.kind === "muted" ? { color: c.grey } : undefined}>{t.value}</span>
          </div>
        ))}
        {doc.totalsNote && <p className="text-right text-xs" style={{ color: c.grey }}>{doc.totalsNote}</p>}
      </div>
      {(doc.blocks.length > 0 || doc.signature) && (
        <div className="mt-8 flex items-start justify-between gap-8 pt-5" style={{ borderTop: `1px solid ${c.rule}` }}>
          <div className="min-w-0 flex-1 space-y-4">
            {doc.blocks.map((b) => <div key={b.label}><p style={label}>{b.label}</p><p className="mt-1 whitespace-pre-line" style={{ fontSize: doc.blocksFont.px, lineHeight: 1.5 }}>{b.text}</p></div>)}
          </div>
          {doc.signature && (
            <div className="w-52 shrink-0 text-center">
              <p style={label}>{doc.signature.label}</p>
              <p className="text-xs" style={{ color: c.grey }}>{doc.signature.issuer}</p>
              <div style={{ height: 64, borderBottom: `1px solid ${c.ink}` }} />
              <p className="mt-1 font-semibold">{doc.signature.name || "\u00a0"}</p>
              {doc.signature.title && <p className="text-xs" style={{ color: c.grey }}>{doc.signature.title}</p>}
            </div>
          )}
        </div>
      )}
      {doc.footer && <p className="mt-8 text-center" style={{ color: c.grey, fontSize: 10 }}>{doc.footer}</p>}
    </div>
  );
}
