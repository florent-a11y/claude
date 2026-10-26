import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel } from "@/lib/dates";
import { fmtIDR } from "@/lib/money";
import { WITHHOLDING_TYPE_LABELS } from "@/lib/tax/withholding";
import { Badge, statusTone, Field } from "@/components/ui";
import { ConfirmForm, PrintButton, SubmitButton } from "@/components/client";
import { deleteSlip, setSlipStatus } from "../../../actions";

export const dynamic = "force-dynamic";

const TITLE: Record<string, string> = { pph21: "PPh PASAL 21", pph23: "PPh PASAL 23", pph26: "PPh PASAL 26", pph4_2: "PPh PASAL 4 AYAT (2)", pph15: "PPh PASAL 15", pph22: "PPh PASAL 22" };

export default async function SlipPage({ params }: { params: Promise<{ entityId: string; slipId: string }> }) {
  const user = await requireUser();
  const { entityId, slipId } = await params;
  const [entity, slip] = await Promise.all([db.get("entities", entityId), db.get("withholding_slips", slipId)]);
  if (!entity || !slip || slip.entityId !== entityId) notFound();
  const bill = slip.billId ? await db.get("bills", slip.billId) : null;
  const canWrite = can(user, "tax:write");
  const row = (id: string, en: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[1fr_2fr] border-b border-slate-200 py-1.5 text-sm"><dt><span className="font-medium">{id}</span><br /><span className="text-xs text-ink-500">{en}</span></dt><dd className="tabular-nums">{value}</dd></div>
  );
  return (
    <div className="pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2"><Link href={`/tax/${entityId}/withholding?period=${slip.period}`} className="btn-ghost">‹ Slips {periodLabel(slip.period)}</Link><Badge tone={statusTone(slip.status)}>{slip.status}</Badge></div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton label="Print bukti potong" />
          {canWrite && slip.status === "draft" && <form action={setSlipStatus.bind(null, slip.id)}><input type="hidden" name="status" value="issued" /><SubmitButton className="btn-secondary" pendingText="Saving…">Mark issued</SubmitButton></form>}
          {canWrite && slip.status !== "reported" && <form action={setSlipStatus.bind(null, slip.id)} className="flex items-center gap-2"><input type="hidden" name="status" value="reported" /><input name="ntpn" placeholder="NTPN" defaultValue={slip.ntpn} className="input !w-44" /><SubmitButton className="btn-secondary" pendingText="Saving…">Mark reported</SubmitButton></form>}
          {canWrite && slip.status === "draft" && <ConfirmForm action={deleteSlip.bind(null, slip.id)} message="Delete this draft slip?"><button className="btn-danger">Delete</button></ConfirmForm>}
        </div>
      </div>
      <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="mb-4 border-b-2 border-ink-900 pb-3 text-center">
          <p className="text-xs uppercase tracking-widest text-ink-500">Kementerian Keuangan Republik Indonesia · Direktorat Jenderal Pajak</p>
          <h1 className="mt-1 text-lg font-bold">BUKTI PEMOTONGAN/PEMUNGUTAN {TITLE[slip.type] ?? slip.type.toUpperCase()}</h1>
          <p className="text-xs text-ink-500">Withholding tax certificate · {WITHHOLDING_TYPE_LABELS[slip.type]} · Unifikasi</p>
          <div className="mt-2 flex justify-between text-sm"><span>Nomor / Number: <b>{slip.number}</b></span><span>Masa pajak / Period: <b>{periodLabel(slip.period)}</b></span></div>
        </header>
        <section className="mb-4">
          <h2 className="mb-1 text-sm font-semibold uppercase text-ink-700">A. Identitas penerima penghasilan · Income recipient</h2>
          <dl>
            {row("NPWP / NIK", "Tax ID", slip.counterparty.npwp ?? slip.counterparty.nik ?? "— (tidak ber-NPWP / no NPWP)")}
            {row("Nama", "Name", slip.counterparty.name)}
            {row("Alamat", "Address", slip.counterparty.address ?? "—")}
            {row("Negara", "Country", slip.counterparty.country ?? "ID")}
          </dl>
        </section>
        <section className="mb-4">
          <h2 className="mb-1 text-sm font-semibold uppercase text-ink-700">B. Pajak penghasilan yang dipotong · Tax withheld</h2>
          <dl>
            {row("Kode objek pajak", "Income type code", slip.objectCode)}
            {row("Jenis penghasilan", "Income type", slip.objectLabel)}
            {row("Dasar pengenaan pajak (DPP)", "Tax base", fmtIDR(slip.baseAmount))}
            {row("Tarif", "Rate", `${(slip.rate * 100).toFixed(2)}%${slip.treatyApplied ? " (tarif P3B / treaty rate, DGT form)" : ""}`)}
            {row("PPh yang dipotong", "Tax withheld", <b>{fmtIDR(slip.taxAmount)}</b>)}
            {row("Dokumen dasar", "Reference document", bill ? `${bill.number}${bill.vendorInvoiceNumber ? ` / ${bill.vendorInvoiceNumber}` : ""} (${fmtDate(bill.date)})` : slip.description ?? "—")}
            {slip.description && bill ? row("Keterangan", "Description", slip.description) : null}
            {slip.ntpn ? row("NTPN", "Payment receipt", slip.ntpn) : null}
          </dl>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase text-ink-700">C. Identitas pemotong · Withholding agent</h2>
          <dl>
            {row("NPWP", "Tax ID", entity.npwp ?? "—")}
            {row("Nama", "Name", entity.legalName)}
            {row("Alamat", "Address", [entity.address, entity.city].filter(Boolean).join(", ") || "—")}
            {row("Tanggal", "Date", fmtDate(slip.date))}
          </dl>
          <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm">
            <div />
            <div><p className="mb-16">Pemotong / Withholding agent</p><p className="border-t border-ink-900 pt-1">{entity.legalName}</p><p className="text-xs text-ink-500">Tanda tangan dan cap / Signature and stamp</p></div>
          </div>
        </section>
        <p className="mt-6 text-[10px] text-ink-500">Bukti potong ini dibuat melalui aplikasi ILA Office sebagai dokumen pendukung e-Bupot Unifikasi. The official certificate is the one generated by DJP's e-Bupot after the SPT is filed.</p>
      </article>
      {canWrite && slip.status !== "draft" && (
        <div className="mx-auto mt-3 max-w-3xl no-print"><Field label="Notes" hint="Slips are immutable once issued; delete and recreate while still draft."><span className="text-xs text-ink-500">Status {slip.status}{slip.ntpn ? ` · NTPN ${slip.ntpn}` : ""}</span></Field></div>
      )}
    </div>
  );
}
