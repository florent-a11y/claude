import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ATTACHMENT_LIMIT, ATTACHMENT_TYPES, attachmentPath, checkAttachment, deleteAttachment, extensionOf, fmtFileSize, isSafePath, mimeFor,
  putAttachment, readAttachment, safeFileName,
} from "../lib/files";

const SAFE = /^[A-Za-z0-9._-]+$/;
const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

test("safeFileName: ASCII only, keeps the extension, strips directories and unsafe characters", () => {
  assert.equal(safeFileName("Facture n°12 – café (final).PDF"), "Facture_n_12_cafe_final.pdf");
  assert.equal(safeFileName("领収書 2026.jpg"), "2026.jpg");
  assert.equal(safeFileName("C:\\Users\\florent\\Desktop\\receipt.png"), "receipt.png");
  assert.equal(safeFileName("  spaced   name .xlsx "), "spaced_name.xlsx");
  assert.equal(safeFileName("noext"), "noext");
  assert.equal(safeFileName("émoji 🧾.pdf"), "emoji.pdf");
  assert.equal(safeFileName("..."), "file");
  for (const n of ["Facture n°12 – café (final).PDF", "领収書 2026.jpg", "a b/c\\d.txt", "weird\u0000name.csv"]) assert.match(safeFileName(n), SAFE);
});

test("safeFileName: path traversal attempts cannot escape or hide", () => {
  const a = safeFileName("../../etc/passwd");
  assert.equal(a, "passwd");
  const b = safeFileName("..\\..\\windows\\system.ini");
  assert.equal(b, "system.ini");
  const c = safeFileName("inv..oice...pdf");
  assert.ok(!c.includes(".."), c);
  assert.ok(!safeFileName(".hidden").startsWith("."));
  assert.equal(safeFileName("..pdf"), "file.pdf"); // empty stem gets a placeholder, the extension is kept
  for (const n of ["../../etc/passwd", "..\\..\\x.pdf", "a/../b.pdf", "....//....//x.png"]) {
    const s = safeFileName(n);
    assert.match(s, SAFE);
    assert.ok(!s.includes("..") && !s.includes("/"), s);
  }
});

test("safeFileName: long names are cut to 80 characters and keep the extension", () => {
  const long = `${"a".repeat(200)}.pdf`;
  const s = safeFileName(long);
  assert.ok(s.length <= 80, String(s.length));
  assert.ok(s.endsWith(".pdf"));
  assert.equal(s, `${"a".repeat(76)}.pdf`);
  const longExt = `${"b".repeat(100)}.${"c".repeat(100)}`;
  const t = safeFileName(longExt);
  assert.ok(t.length <= 80 + 101); // the (bogus) extension is kept whole; stems always get at least one character
  assert.ok(t.startsWith("b"));
  const noExt = safeFileName("x".repeat(500));
  assert.equal(noExt.length, 80);
});

test("attachmentPath: <entityId>/<docType>/<docId>/<id>-<safe name>", () => {
  const p = attachmentPath("ent-1", "invoice", "inv-9", ID, "Reçu n°3 (copie).pdf");
  assert.equal(p, `ent-1/invoice/inv-9/${ID}-Recu_n_3_copie.pdf`);
  assert.ok(isSafePath(p));
  // A name carrying directories keeps only its last segment.
  assert.equal(attachmentPath("ent-1", "invoice", "inv-9", ID, "Reçu n°3 ../../x.pdf"), `ent-1/invoice/inv-9/${ID}-x.pdf`);
  assert.throws(() => attachmentPath("../ent", "invoice", "inv", ID, "a.pdf"), /Invalid entity id/);
  assert.throws(() => attachmentPath("ent", "in/voice", "inv", ID, "a.pdf"), /Invalid document type/);
  assert.throws(() => attachmentPath("ent", "invoice", "..", ID, "a.pdf"), /Invalid document id/);
  assert.throws(() => attachmentPath("ent", "invoice", "inv", "", "a.pdf"), /Invalid attachment id/);
});

test("isSafePath rejects traversal, absolute paths and empty segments", () => {
  assert.ok(isSafePath("ent/invoice/doc/id-file.pdf"));
  assert.ok(!isSafePath("/ent/invoice/doc/id-file.pdf"));
  assert.ok(!isSafePath("ent/../other/doc/id-file.pdf"));
  assert.ok(!isSafePath("ent/invoice//doc/id-file.pdf"));
  assert.ok(!isSafePath("ent\\invoice\\doc\\file.pdf"));
  assert.ok(!isSafePath("ent/./doc/file.pdf"));
  assert.ok(!isSafePath(""));
});

test("extension and MIME come from the allowlist", () => {
  assert.equal(extensionOf("Scan.PDF"), "pdf");
  assert.equal(extensionOf("archive.tar.gz"), "gz");
  assert.equal(extensionOf(".bashrc"), "");
  assert.equal(extensionOf("noext"), "");
  assert.equal(mimeFor("receipt.jpeg"), "image/jpeg");
  assert.equal(mimeFor("ledger.XLSX"), ATTACHMENT_TYPES.xlsx);
  assert.equal(mimeFor("page.html"), undefined);
  assert.equal(mimeFor("script.js"), undefined);
});

test("checkAttachment: allowlist by extension and MIME", () => {
  assert.equal(checkAttachment({ name: "invoice.pdf", size: 1000, type: "application/pdf" }), null);
  assert.equal(checkAttachment({ name: "INVOICE.PDF", size: 1000, type: "" }), null);
  assert.equal(checkAttachment({ name: "photo.heic", size: 1000, type: "application/octet-stream" }), null);
  assert.equal(checkAttachment({ name: "mail.msg", size: 1000, type: "" }), null);
  assert.equal(checkAttachment({ name: "export.csv", size: 1000, type: "application/vnd.ms-excel" }), null); // Windows reports CSV as Excel
  assert.equal(checkAttachment({ name: "notes.txt", size: 1000, type: "text/plain; charset=utf-8" }), null);
  assert.match(checkAttachment({ name: "setup.exe", size: 1000, type: "application/octet-stream" }) ?? "", /not allowed/);
  assert.match(checkAttachment({ name: "page.html", size: 1000, type: "text/html" }) ?? "", /not allowed/);
  assert.match(checkAttachment({ name: "logo.svg", size: 1000, type: "image/svg+xml" }) ?? "", /not allowed/);
  assert.match(checkAttachment({ name: "noext", size: 1000, type: "" }) ?? "", /not allowed/);
  assert.match(checkAttachment({ name: "fake.pdf", size: 1000, type: "text/html" }) ?? "", /not allowed/); // extension ok, browser MIME not
  assert.match(checkAttachment({ name: "", size: 1000, type: "" }) ?? "", /Choose a file/);
});

test("checkAttachment: size limits", () => {
  assert.equal(ATTACHMENT_LIMIT, 4 * 1024 * 1024);
  assert.equal(checkAttachment({ name: "a.pdf", size: ATTACHMENT_LIMIT, type: "application/pdf" }), null);
  assert.match(checkAttachment({ name: "a.pdf", size: ATTACHMENT_LIMIT + 1, type: "application/pdf" }) ?? "", /4\.0 MB per file/);
  assert.match(checkAttachment({ name: "big.pdf", size: 12 * 1024 * 1024, type: "application/pdf" }) ?? "", /12 MB/);
  assert.match(checkAttachment({ name: "a.pdf", size: 0, type: "application/pdf" }) ?? "", /empty/);
  assert.match(checkAttachment({ name: "a.pdf", size: Number.NaN, type: "application/pdf" }) ?? "", /empty/);
});

test("fmtFileSize", () => {
  assert.equal(fmtFileSize(0), "1 KB");
  assert.equal(fmtFileSize(512), "1 KB");
  assert.equal(fmtFileSize(12 * 1024), "12 KB");
  assert.equal(fmtFileSize(1.5 * 1024 * 1024), "1.5 MB");
});

test("file backend: put, read, delete round trip under ILA_DATA_DIR/files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ila-files-"));
  const prev = process.env.ILA_DATA_DIR;
  process.env.ILA_DATA_DIR = dir;
  try {
    const file = new File([Buffer.from("%PDF-1.4 test")], "Reçu café.pdf", { type: "application/pdf" });
    const a = await putAttachment({ entityId: "ent-1", docType: "bill", docId: "bill-1", file, byUserId: "u1", byName: "Admin" });
    assert.equal(a.name, "Reçu café.pdf"); // display name keeps the original spelling
    assert.equal(a.type, "application/pdf");
    assert.equal(a.size, 13);
    assert.equal(a.byName, "Admin");
    assert.match(a.path, new RegExp(`^ent-1/bill/bill-1/${a.id}-Recu_cafe\\.pdf$`));
    const stat = await fs.stat(path.join(dir, "files", a.path));
    assert.equal(stat.size, 13);

    const read = await readAttachment(a.path);
    assert.ok(read);
    assert.equal(read.buffer.toString(), "%PDF-1.4 test");
    assert.equal(read.type, "application/pdf");
    assert.equal(read.name, "Recu_cafe.pdf");

    assert.equal(await readAttachment("ent-1/bill/bill-1/missing.pdf"), null);
    await assert.rejects(readAttachment("ent-1/../../etc/passwd"), /Invalid file path/);
    await assert.rejects(readAttachment("/etc/passwd"), /Invalid file path/);
    await assert.rejects(deleteAttachment("../x.pdf"), /Invalid file path/);

    // Refused files are never written.
    await assert.rejects(putAttachment({ entityId: "ent-1", docType: "bill", docId: "bill-1", file: new File([Buffer.from("<html>")], "evil.html", { type: "text/html" }) }), /not allowed/);
    await assert.rejects(putAttachment({ entityId: "ent-1", docType: "bill", docId: "bill-1", file: new File([], "empty.pdf", { type: "application/pdf" }) }), /empty/);
    assert.deepEqual(await fs.readdir(path.join(dir, "files", "ent-1", "bill", "bill-1")), [`${a.id}-Recu_cafe.pdf`]);

    await deleteAttachment(a.path);
    assert.equal(await readAttachment(a.path), null);
    await deleteAttachment(a.path); // idempotent
  } finally {
    if (prev === undefined) delete process.env.ILA_DATA_DIR; else process.env.ILA_DATA_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
