import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel } from "@/lib/dates";
import { fmtNumber } from "@/lib/money";
import { BUPOT_TITLES, JENIS_PPH, bupotKind, documentLabel, facilityLabel, isFinal, nitkuOf, npwp16 } from "@/lib/tax/withholding";
import { Badge, statusTone, Field } from "@/components/ui";
import { ConfirmForm, PrintButton, SubmitButton } from "@/components/client";
import { Attachments } from "@/components/Attachments";
import { deleteSlip, setSlipStatus } from "../../../actions";

export const dynamic = "force-dynamic";

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function tanggal(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS_ID[(m || 1) - 1]} ${y}`;
}
const rp = (n: number) => fmtNumber(n, 0, "id-ID");
const pct = (r: number) => { const v = r * 100; return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(".", ","); };

/**
 * Bukti potong rendered in the layout of the Coretax forms (BPPU for the unified withholding taxes, BP21 for PPh 21
 * paid to non-employees). The official certificate carries Coretax's number, QR code and electronic signature; this
 * page prints the same content as a supporting document for the recipient until the slip is filed.
 */
export default async function SlipPage({ params }: { params: Promise<{ entityId: string; slipId: string }> }) {
  const user = await requireUser();
  const { entityId, slipId } = await params;
  const [entity, slip] = await Promise.all([db.get("entities", entityId), db.get("withholding_slips", slipId)]);
  if (!entity || !slip || slip.entityId !== entityId) notFound();
  const bill = slip.billId ? await db.get("bills", slip.billId) : null;
  const canWrite = can(user, "tax:write");
  const kind = bupotKind(slip.type);
  const here = `/tax/${entityId}/withholding/${slip.id}`;
  const recipientId = npwp16(slip.counterparty.npwp ?? slip.counterparty.nik) || "-";
  const recipientNitku = nitkuOf(slip.counterparty.npwp ?? slip.counterparty.nik, slip.counterparty.nitku);
  const agentId = npwp16(entity.npwp) || "-";
  const agentNitku = nitkuOf(entity.npwp, entity.nitku);
  const docNumber = slip.document?.number ?? (bill ? bill.vendorInvoiceNumber ?? bill.number : "");
  const docDate = slip.document?.date ?? (bill ? bill.date : slip.date);
  const gross = slip.grossAmount ?? slip.baseAmount;
  const dppPct = slip.dppPercent ?? 100;
  const nomor = slip.coretaxNumber ?? slip.number;
  const idRow = (no: string, label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[34px_200px_12px_1fr] items-start gap-1 px-2 py-1 text-[12px]"><span className="text-ink-700">{no}</span><span className="text-ink-700">{label}</span><span>:</span><span className="min-w-0 break-words">{value}</span></div>
  );
  const bar = (text: string) => <div className="bg-[#1d3f7a] px-2 py-0.5 text-[11px] font-bold uppercase text-white">{text}</div>;
  const th = (label: string, sub: string, cls = "") => <th className={`border border-slate-300 bg-slate-200 px-1 py-1 text-[10px] font-bold uppercase leading-tight ${cls}`}>{label}<br /><span className="font-semibold">{sub}</span></th>;
  return (
    <div className="pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2"><Link href={`/tax/${entityId}/withholding?period=${slip.period}`} className="btn-ghost">‹ Slips {periodLabel(slip.period)}</Link><Badge tone={statusTone(slip.status)}>{slip.status}</Badge>{slip.correction && <Badge tone="amber">pembetulan</Badge>}</div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/tax/${entityId}/withholding/${slip.id}/pdf`} className="btn-secondary" target="_blank" rel="noopener">Download PDF</a>
          <PrintButton label="Print" />
          {canWrite && slip.status === "draft" && <form action={setSlipStatus.bind(null, slip.id)}><input type="hidden" name="status" value="issued" /><SubmitButton className="btn-secondary" pendingText="Saving…">Mark issued</SubmitButton></form>}
          {canWrite && slip.status !== "reported" && <form action={setSlipStatus.bind(null, slip.id)} className="flex items-center gap-2"><input type="hidden" name="status" value="reported" /><input name="coretaxNumber" placeholder="Coretax number" defaultValue={slip.coretaxNumber} className="input !w-40" /><input name="ntpn" placeholder="NTPN" defaultValue={slip.ntpn} className="input !w-40" /><SubmitButton className="btn-secondary" pendingText="Saving…">Mark reported</SubmitButton></form>}
          {canWrite && slip.status === "draft" && <ConfirmForm action={deleteSlip.bind(null, slip.id)} message="Delete this draft slip?"><button className="btn-danger">Delete</button></ConfirmForm>}
        </div>
      </div>
      <article className="bupot mx-auto max-w-[210mm] rounded-xl border border-slate-200 bg-white p-8 text-ink-900 print:border-0 print:p-0" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <header className="mb-3 grid grid-cols-[1fr_2fr_1fr] items-start gap-3">
          <div className="text-[10px] leading-tight"><p>KEMENTERIAN KEUANGAN</p><p>REPUBLIK INDONESIA</p><p className="font-bold">DIREKTORAT JENDERAL PAJAK</p></div>
          <div className="text-[12px] font-bold leading-tight">{BUPOT_TITLES[kind].map((t) => <p key={t}>{t}</p>)}</div>
          <div className="flex h-12 items-center justify-center bg-[#ffd400] text-[22px] font-bold tracking-wide">{kind}</div>
        </header>
        <div className="mb-2 grid grid-cols-4 gap-1 text-center text-[10px]">
          {[["NOMOR" + (kind === "BP21" ? " BUKTI PEMOTONGAN" : ""), nomor], ["MASA PAJAK", `${slip.period.slice(5, 7)}-${slip.period.slice(0, 4)}`], [kind === "BPPU" ? "SIFAT PEMOTONGAN DAN/ATAU PEMUNGUTAN PPh" : "SIFAT PEMOTONGAN", isFinal(slip) ? "FINAL" : "TIDAK FINAL"], [kind === "BPPU" ? "STATUS BUKTI PEMOTONGAN / PEMUNGUTAN" : "STATUS BUKTI PEMOTONGAN", slip.correction ? "PEMBETULAN" : "NORMAL"]].map(([l, v]) => (
            <div key={l} className="bg-slate-200 p-1"><p className="min-h-[22px] font-bold leading-tight">{l}</p><p className="mt-1 bg-white py-0.5 text-[11px]">{v}</p></div>
          ))}
        </div>
        {bar(kind === "BPPU" ? "A. IDENTITAS WAJIB PAJAK YANG DIPOTONG DAN/ATAU DIPUNGUT PPh ATAU PENERIMA PENGHASILAN" : "A. IDENTITAS PENERIMA PENGHASILAN")}
        <div className="divide-y divide-slate-100 border-b border-slate-200">
          {idRow("A.1", kind === "BPPU" ? "NPWP / NIK" : "NIK/NPWP", recipientId)}
          {idRow("A.2", "NAMA", slip.counterparty.name)}
          {idRow("A.3", kind === "BPPU" ? "NOMOR IDENTITAS TEMPAT KEGIATAN USAHA (NITKU)" : "NITKU", recipientNitku ? `${recipientNitku} - ${slip.counterparty.name}` : "-")}
        </div>
        {bar(kind === "BPPU" ? "B. PEMOTONGAN DAN/ATAU PEMUNGUTAN PPh" : "B. PENGHASILAN YANG DIPOTONG")}
        <div className="px-2 py-1 text-[12px]"><span className="mr-3 text-ink-700">B.1</span>Jenis Fasilitas : {facilityLabel(slip)}</div>
        {kind === "BPPU" && <div className="px-2 py-1 text-[12px]"><span className="mr-3 text-ink-700">B.2</span>Jenis PPh : {JENIS_PPH[slip.type]}</div>}
        <table className="mx-2 my-2 w-[calc(100%-16px)] border-collapse text-[11px]">
          <thead>
            {kind === "BPPU" ? (
              <tr>{th("KODE OBJEK PAJAK", "B.3", "w-[18%]")}{th("OBJEK PAJAK", "B.4")}{th("DPP (Rp)", "B.5", "w-[15%]")}{th("TARIF (%)", "B.6", "w-[10%]")}{th("PAJAK PENGHASILAN (Rp)", "B.7", "w-[18%]")}</tr>
            ) : (
              <tr>{th("KODE OBJEK PAJAK", "B.2", "w-[15%]")}{th("OBJEK PAJAK", "B.3")}{th("PENGHASILAN BRUTO (Rp)", "B.4", "w-[15%]")}{th("DPP (%)", "B.5", "w-[9%]")}{th("TARIF (%)", "B.6", "w-[9%]")}{th("PPh DIPOTONG (Rp)", "B.7", "w-[15%]")}</tr>
            )}
          </thead>
          <tbody>
            {kind === "BPPU" ? (
              <tr><td className="px-1 py-1 text-center align-top">{slip.objectCode}</td><td className="px-1 py-1 align-top">{slip.objectLabel}</td><td className="px-1 py-1 text-right align-top tabular-nums">{rp(slip.baseAmount)}</td><td className="px-1 py-1 text-center align-top">{pct(slip.rate)}</td><td className="px-1 py-1 text-right align-top tabular-nums">{rp(slip.taxAmount)}</td></tr>
            ) : (
              <tr><td className="px-1 py-1 text-center align-top">{slip.objectCode}</td><td className="px-1 py-1 align-top">{slip.objectLabel}</td><td className="px-1 py-1 text-right align-top tabular-nums">{rp(gross)}</td><td className="px-1 py-1 text-center align-top">{dppPct}</td><td className="px-1 py-1 text-center align-top">{pct(slip.rate)}</td><td className="px-1 py-1 text-right align-top tabular-nums">{rp(slip.taxAmount)}</td></tr>
            )}
          </tbody>
        </table>
        <div className="grid grid-cols-[34px_200px_1fr] gap-1 px-2 py-1 text-[12px]"><span className="text-ink-700">B.8</span><span className="text-ink-700">{kind === "BPPU" ? "Dokumen Dasar Bukti Pemotongan dan/atau Pemungutan PPh Unifikasi atau Dasar Pemberian Fasilitas" : "Dokumen Referensi"}</span><span className="grid grid-cols-2 gap-2"><span>Jenis Dokumen : {documentLabel(slip) || "-"}</span><span>Tanggal{kind === "BP21" ? " Dokumen" : ""} : {tanggal(docDate)}</span></span></div>
        <div className="grid grid-cols-[34px_200px_1fr] gap-1 px-2 py-1 text-[12px]"><span className="text-ink-700">B.9</span><span /><span>Nomor Dokumen : {docNumber || "-"}</span></div>
        {kind === "BPPU" && <>
          <div className="grid grid-cols-[34px_1fr] gap-1 px-2 py-1 text-[12px]"><span className="text-ink-700">B.10</span><span>Untuk Instansi Pemerintah, Pembayaran PPh Menggunakan :</span></div>
          <div className="grid grid-cols-[34px_200px_1fr] gap-1 px-2 py-1 text-[12px]"><span className="text-ink-700">B.11</span><span /><span>Nomor SP2D :</span></div>
        </>}
        {bar(kind === "BPPU" ? "C. IDENTITAS PEMOTONG DAN/ATAU PEMUNGUT PPh" : "C. IDENTITAS PEMOTONG PPh")}
        <div className="divide-y divide-slate-100">
          {idRow("C.1", kind === "BPPU" ? "NPWP / NIK" : "NPWP/NIK", agentId)}
          {idRow("C.2", kind === "BPPU" ? "NOMOR IDENTITAS TEMPAT KEGIATAN USAHA (NITKU) / SUBUNIT ORGANISASI" : "NITKU atau Nomor Identitas Subunit Organisasi", agentNitku ? `${agentNitku} - ${entity.legalName}` : "-")}
          {idRow("C.3", kind === "BPPU" ? "NAMA PEMOTONG DAN/ATAU PEMUNGUT PPh" : "Nama Pemotong", entity.legalName)}
          {idRow("C.4", "TANGGAL", tanggal(slip.date))}
          {idRow("C.5", "NAMA PENANDATANGAN", entity.tax.signerName ?? "-")}
          {idRow("C.6", kind === "BPPU" ? "PERNYATAAN WAJIB PAJAK" : "Pernyataan", <span className="block space-y-1 text-[11px]"><span className="block">Dengan ini saya menyatakan bahwa Bukti Pemotongan {kind === "BPPU" ? "dan/atau Pemungutan PPh Unifikasi " : ""}ini telah saya isi dengan benar dan telah saya tandatangani secara elektronik.</span><span className="block">Sesuai dengan ketentuan yang berlaku, Direktorat Jenderal Pajak mengatur bahwa Bukti Pemotongan {kind === "BPPU" ? "dan/atau Pemungutan PPh Unifikasi " : ""}ini dinyatakan sah dan tidak diperlukan tanda tangan basah pada Bukti Pemotongan ini.</span></span>)}
        </div>
        <div className="mt-4 flex items-end gap-3">
          <div className="h-16 w-16 border border-dashed border-slate-300" aria-hidden />
          <p className="text-[10px] text-ink-500">{slip.status === "reported" && slip.coretaxNumber ? "Ditandatangani secara elektronik" : "Dicetak dari ILA Office · belum dilaporkan di Coretax"}</p>
        </div>
        <p className="mt-8 text-[9px] text-ink-500">Pemberitahuan: Bukti Potong ini dibuat dengan ILA Office sebagai dokumen pendukung. Bukti potong yang sah adalah yang diterbitkan melalui Coretax DJP setelah pelaporan. / Supporting document; the valid certificate is the one issued by Coretax after filing.</p>
      </article>
      <div className="mx-auto mt-4 max-w-[210mm] no-print">
        <Attachments entityId={entityId} docType="slip" docId={slip.id} items={slip.attachments ?? []} canWrite={canWrite} backTo={here} />
        {canWrite && slip.status !== "draft" && <Field label="Notes" hint="Slips are immutable once issued; delete and recreate while still draft." className="mt-3"><span className="text-xs text-ink-500">Status {slip.status}{slip.coretaxNumber ? ` · Coretax ${slip.coretaxNumber}` : ""}{slip.ntpn ? ` · NTPN ${slip.ntpn}` : ""}</span></Field>}
      </div>
    </div>
  );
}
