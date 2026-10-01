import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount, parseDate, inferDateFormat, parseTimestamp, stripCurrencySuffix, splitPersonName, looksLikeCompany, guessEntityType, tableFromCSV,
  parseHubspotContacts, parseQboCustomers, parseQboInvoices, dedupeContacts, dedupeCompanies, dedupeInvoices,
} from "../lib/importers";

// ---------- Building blocks ----------

test("amounts: QBO (en-US) and Indonesian separators, negatives, currency prefixes", () => {
  assert.equal(parseAmount("1,000,000"), 1_000_000); // lib/money.parseMoney returns 0 for this shape
  assert.equal(parseAmount("1,000,000.00"), 1_000_000);
  assert.equal(parseAmount("43,000,000.00"), 43_000_000);
  assert.equal(parseAmount("1.000.000,50"), 1_000_000.5);
  assert.equal(parseAmount("2.500.000"), 2_500_000);
  assert.equal(parseAmount("1315.00"), 1315);
  assert.equal(parseAmount("1,315.5"), 1315.5);
  assert.equal(parseAmount("0,5"), 0.5);
  assert.equal(parseAmount("(1,200.00)"), -1200);
  assert.equal(parseAmount("-250"), -250);
  assert.equal(parseAmount("USD 1,315.00"), 1315);
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount(undefined), 0);
});

test("dates: ISO, day-first, month-first, textual and two-digit years", () => {
  assert.equal(parseDate("2026-01-15"), "2026-01-15");
  assert.equal(parseDate("2026-01-15T10:00:00Z"), "2026-01-15");
  assert.equal(parseDate("15/01/2026", "dmy"), "2026-01-15");
  assert.equal(parseDate("01/15/2026", "mdy"), "2026-01-15");
  assert.equal(parseDate("15/01/2026", "auto"), "2026-01-15"); // day > 12 → day-first
  assert.equal(parseDate("01/15/2026", "auto"), "2026-01-15"); // month part > 12 → month-first
  assert.equal(parseDate("03/04/2026", "auto"), "2026-04-03"); // ambiguous → day-first (QBO Indonesia)
  assert.equal(parseDate("03/04/2026", "mdy"), "2026-03-04");
  assert.equal(parseDate("15.01.26", "dmy"), "2026-01-15");
  assert.equal(parseDate("15 Jan 2026"), "2026-01-15");
  assert.equal(parseDate("Jan 15, 2026"), "2026-01-15");
  assert.equal(parseDate("31/02/2026", "dmy"), undefined);
  assert.equal(parseDate(""), undefined);
  assert.equal(inferDateFormat(["03/04/2026", "01/15/2026"]), "mdy");
  assert.equal(inferDateFormat(["03/04/2026", "15/01/2026"]), "dmy");
  assert.equal(inferDateFormat(["2026-01-15", "2026-02-01"]), "ymd");
  assert.equal(parseTimestamp("2024-03-12 09:14"), "2024-03-12T09:14:00.000Z");
  assert.equal(parseTimestamp("3/15/2024 2:30 PM", "mdy"), "2024-03-15T14:30:00.000Z");
});

test("names: currency suffixes, Last-First order, company heuristics", () => {
  assert.deepEqual(stripCurrencySuffix("Jane Doe - USD"), { name: "Jane Doe", currency: "USD" });
  assert.deepEqual(stripCurrencySuffix("PT Example (EUR)"), { name: "PT Example", currency: "EUR" });
  assert.deepEqual(stripCurrencySuffix("Acme Studio IDR"), { name: "Acme Studio", currency: "IDR" });
  assert.deepEqual(stripCurrencySuffix("Mohamed Aud"), { name: "Mohamed Aud" }); // codes are upper-case only
  assert.deepEqual(splitPersonName("Smith, John"), { firstName: "John", lastName: "Smith" });
  assert.deepEqual(splitPersonName("Jean Marie Dupont"), { firstName: "Jean", lastName: "Marie Dupont" });
  assert.deepEqual(splitPersonName("Mr. Ivan Petrov"), { firstName: "Ivan", lastName: "Petrov" });
  assert.deepEqual(splitPersonName("Madonna"), { firstName: "Madonna", lastName: "" });
  for (const n of ["PT Bali Dream Villas", "CV. Maju Jaya", "Blue Ocean Holdings Ltd", "Sunrise Limited", "Acme LLC", "Down Under Pty", "Schmidt GmbH", "Tallinn OÜ", "Widgets Inc", "Nusa Group", "Smith & Partners"]) {
    assert.ok(looksLikeCompany(n), `${n} should be a company`);
  }
  for (const n of ["John Smith", "Camille Durand", "Anna-Lena Schmidt", "Wayan Sudiarta"]) assert.ok(!looksLikeCompany(n), `${n} should be a person`);
  assert.deepEqual(guessEntityType("PT Bali Dream Villas"), { type: "pt_pma", country: "ID" });
  assert.deepEqual(guessEntityType("CV Maju Jaya"), { type: "cv", country: "ID" });
  assert.deepEqual(guessEntityType("Blue Ocean Holdings Ltd", "Central, Hong Kong"), { type: "hk_ltd", country: "HK" });
  assert.equal(guessEntityType("Smith & Partners", "12 Collins St, Melbourne, Australia").country, "AU");
});

test("table reader skips QBO report title lines and normalises headers", () => {
  const t = tableFromCSV("PT ILA GLOBAL CONSULTING\nInvoice List\nJanuary 1 - December 31, 2025\n\nDate,Num,Customer,Memo/Description,Open Balance (IDR)\n01/02/2025,1,Acme,Visa,0\n");
  assert.equal(t.headerLine, 4); // blank line dropped by the CSV parser
  assert.deepEqual(t.headers, ["date", "num", "customer", "memo description", "open balance"]);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].cells["memo description"], "Visa");
});

// ---------- HubSpot ----------

const HUBSPOT = `Record ID,First Name,Last Name,Email,Phone Number,Lead Status,Create Date,Associated Company,Country/Region,Contact owner
101,Camille,Durand,camille@example.com,+33 6 00 00 00 00,NEW,2024-03-12 09:14,PT Demo Villa Investama,France,florent@ilaglobalconsulting.com
102,John,Smith,JOHN@Example.com,,OPEN_DEAL,3/15/2024 2:30 PM,,Australia,
103,,,,,,2024-01-01 00:00,,,
104,Camille,Durand,camille@example.com,,,2024-03-13 09:14,,,
105,,,noname@example.com,,,,,,
`;

test("HubSpot contacts: mapping, tags, timestamps and rejects", () => {
  const r = parseHubspotContacts(HUBSPOT, { dateFormat: "mdy" });
  assert.equal(r.rowCount, 5);
  assert.equal(r.drafts.length, 4);
  assert.deepEqual(r.errors, [{ line: 4, message: "no name and no email" }]);
  const camille = r.drafts[0];
  assert.equal(camille.hubspotId, "101");
  assert.equal(camille.firstName, "Camille");
  assert.equal(camille.lastName, "Durand");
  assert.equal(camille.email, "camille@example.com");
  assert.equal(camille.phone, "+33 6 00 00 00 00");
  assert.equal(camille.nationality, "FR");
  assert.equal(camille.companyName, "PT Demo Villa Investama");
  assert.equal(camille.ownerName, "florent@ilaglobalconsulting.com");
  assert.ok(camille.tags.includes("hubspot") && camille.tags.includes("lead-status:new"));
  assert.equal(camille.createdAt, "2024-03-12T09:14:00.000Z");
  const john = r.drafts[1];
  assert.equal(john.email, "john@example.com"); // lower-cased
  assert.equal(john.nationality, "AU");
  assert.equal(john.createdAt, "2024-03-15T14:30:00.000Z");
  const noname = r.drafts[3];
  assert.equal(noname.firstName, "noname");
  assert.ok(noname.warnings.some((w) => /email local part/.test(w)));
});

test("HubSpot contacts: dedupe by email (case-insensitive) and by Record ID, in the file and against the store", () => {
  const r = parseHubspotContacts(HUBSPOT, { dateFormat: "mdy" });
  const { fresh, duplicates } = dedupeContacts(r.drafts, [{ email: "John@example.com" }, { hubspotId: "999" }]);
  assert.deepEqual(fresh.map((d) => d.hubspotId), ["101", "105"]);
  assert.equal(duplicates.length, 2);
  assert.match(duplicates.find((d) => d.draft.hubspotId === "102")!.reason, /already exists \(email/);
  assert.match(duplicates.find((d) => d.draft.hubspotId === "104")!.reason, /repeated in the file/);
  const byId = dedupeContacts(r.drafts, [{ hubspotId: "101", email: "other@example.com" }]);
  assert.ok(byId.duplicates.some((d) => d.draft.hubspotId === "101" && /hubspot 101/.test(d.reason)));
});

// ---------- QuickBooks customers ----------

const QBO_CUSTOMERS = `PT ILA GLOBAL CONSULTING
Customer Contact List
As of October 1, 2026

Customer,Phone Numbers,Email,Full Name,Billing Address,Open Balance,Currency
"PT Bali Dream Villas",+62 361 000 111,info@balidream.example,Wayan Sudiarta,"Jl. Raya Canggu 10, Badung, Indonesia",0,IDR
"Smith, John - USD",,john@example.com,,"12 Collins St, Melbourne, Australia","1,200.00",USD
"Anna Schmidt EUR",,anna@example.de,,,0,EUR
"Blue Ocean Holdings Ltd (HKD)",,,,"Central, Hong Kong",0,HKD
"Maria Lopez (deleted)",,,,,0,
"Nusa Group:Villa Ubud",,,,,0,IDR
Total,,,,,,
`;

test("QBO customers: company vs contact, name order, currency suffixes, inactive and sub-customers", () => {
  const r = parseQboCustomers(QBO_CUSTOMERS);
  assert.equal(r.drafts.length, 6);
  assert.deepEqual(r.skipped, [{ line: 11, reason: "report total line" }]);
  const [pt, john, anna, blue, maria, ubud] = r.drafts;
  assert.equal(pt.kind, "company");
  assert.equal(pt.name, "PT Bali Dream Villas");
  assert.equal(pt.entityType, "pt_pma");
  assert.equal(pt.country, "ID");
  assert.equal(pt.currency, "IDR");
  assert.equal(pt.firstName, "Wayan");
  assert.equal(pt.lastName, "Sudiarta");
  assert.equal(pt.email, "info@balidream.example");
  assert.equal(pt.openBalance, 0);
  assert.equal(john.kind, "contact");
  assert.equal(john.firstName, "John");
  assert.equal(john.lastName, "Smith");
  assert.equal(john.currency, "USD");
  assert.equal(john.displayName, "Smith, John - USD");
  assert.equal(john.qboCustomerId, "Smith, John - USD");
  assert.equal(john.openBalance, 1200);
  assert.equal(anna.kind, "contact");
  assert.equal(anna.name, "Anna Schmidt");
  assert.equal(anna.currency, "EUR");
  assert.equal(blue.kind, "company");
  assert.equal(blue.name, "Blue Ocean Holdings Ltd");
  assert.equal(blue.entityType, "hk_ltd");
  assert.equal(blue.currency, "HKD");
  assert.equal(maria.kind, "contact");
  assert.equal(maria.inactive, true);
  assert.equal(maria.name, "Maria Lopez");
  assert.equal(ubud.kind, "company"); // "villa" is a company token; the parent is kept as a note
  assert.equal(ubud.name, "Villa Ubud");
  assert.match(ubud.notes ?? "", /sub-customer of: Nusa Group/);
});

test("QBO customers: Excel-style export with separate name columns", () => {
  const r = parseQboCustomers("Customer,Company,First Name,Last Name,Email,Phone,Open balance\nDown Under Pty,Down Under Pty,Bruce,Lee,bruce@example.au,+61 4,0\nIvan Petrov,,Ivan,Petrov,,,0\n");
  assert.equal(r.drafts[0].kind, "company");
  assert.equal(r.drafts[0].firstName, "Bruce");
  assert.equal(r.drafts[1].kind, "contact");
  assert.equal(r.drafts[1].lastName, "Petrov");
});

test("QBO customers: dedupe companies by name (punctuation-insensitive) and by QBO id", () => {
  const r = parseQboCustomers(QBO_CUSTOMERS);
  const companies = r.drafts.filter((d) => d.kind === "company").map((d) => ({ name: d.name, qboCustomerId: d.qboCustomerId }));
  const { fresh, duplicates } = dedupeCompanies(companies, [{ name: "PT. Bali Dream Villas" }, { name: "Other", qboCustomerId: "Blue Ocean Holdings Ltd (HKD)" }]);
  assert.deepEqual(fresh.map((c) => c.name), ["Villa Ubud"]);
  assert.equal(duplicates.length, 2);
});

// ---------- QuickBooks invoices ----------

const QBO_INVOICES_DMY = `PT ILA GLOBAL CONSULTING
Invoice List
January 1 - December 31, 2025

Date,Num,Customer,Memo/Description,Due Date,Amount,Open Balance,Currency,Exchange rate
15/01/2025,1041,"PT Bali Dream Villas","Working KITAS - 1 year",20/01/2025,"43,000,000.00","0.00",IDR,
02/02/2025,1042,"Smith, John - USD","Investor KITAS 2 years",05/02/2025,"1,100.00","1,315.00",USD,16250
02/02/2025,1042,"Smith, John - USD","Onshore conversion",05/02/2025,"215.00","1,315.00",USD,16250
13/03/2025,1043,"Anna Schmidt EUR","Legal due diligence",18/03/2025,"395.00","100.00",EUR,
28/03/2025,,"Anna Schmidt EUR","line without a number",,"10.00","10.00",EUR,
,,,,,"44,720.00",,,
Total,,,,,"44,720.00",,,
`;

test("QBO invoices: Invoice List report, dd/mm/yyyy, multi-line invoices, status from open balance", () => {
  const r = parseQboInvoices(QBO_INVOICES_DMY, { dateFormat: "dmy" });
  assert.equal(r.drafts.length, 3);
  assert.deepEqual(r.currencies, ["EUR", "IDR", "USD"]);
  assert.ok(r.hasOpenBalanceColumn);
  assert.deepEqual(r.errors, [{ line: 9, message: "missing invoice number" }]);
  assert.ok(r.skipped.some((s) => s.reason === "report total line"));
  const [a, b, c] = r.drafts;
  assert.equal(a.qboDocNumber, "1041");
  assert.equal(a.date, "2025-01-15");
  assert.equal(a.dueDate, "2025-01-20");
  assert.equal(a.currency, "IDR");
  assert.equal(a.total, 43_000_000);
  assert.equal(a.status, "paid");
  assert.equal(a.amountPaid, 43_000_000);
  assert.equal(a.lines[0].description, "Working KITAS - 1 year");
  assert.equal(b.qboDocNumber, "1042");
  assert.equal(b.currency, "USD");
  assert.equal(b.fxRate, 16250);
  assert.equal(b.lines.length, 2);
  assert.equal(b.total, 1315);
  assert.equal(b.openBalance, 1315);
  assert.equal(b.status, "sent");
  assert.equal(b.customerName, "Smith, John - USD");
  assert.equal(c.currency, "EUR"); // from the name suffix: no Currency cell
  assert.equal(c.fxRate, undefined);
  assert.equal(c.status, "partial");
  assert.equal(c.amountPaid, 295);
});

test("QBO invoices: Sales export with Transaction date / No. / Name / Status / Balance, ISO dates, non-invoice rows skipped", () => {
  const csv = `Transaction date,Transaction type,No.,Name,Status,Due date,Total,Balance,Currency
2025-04-01,Invoice,1050,PT Bali Dream Villas,Paid,2025-04-04,"1,500,000.00",0.00,IDR
2025-04-03,Payment,,PT Bali Dream Villas,,,"-1,500,000.00",,IDR
2025-05-01,Invoice,1051,Anna Schmidt EUR,Open,2025-05-06,"250.00","250.00",EUR
2025-05-02,Invoice,1052,Anna Schmidt EUR,Voided,2025-05-06,"0.00","0.00",EUR
`;
  const r = parseQboInvoices(csv, { dateFormat: "auto" });
  assert.deepEqual(r.drafts.map((d) => [d.qboDocNumber, d.status, d.total]), [["1050", "paid", 1_500_000], ["1051", "sent", 250]]);
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[0].reason, /Payment/);
  assert.match(r.skipped[1].reason, /voided/);
  assert.equal(r.errors.length, 0);
});

test("QBO invoices: US dates and a Status column without open balances", () => {
  const csv = "Date,Num,Customer,Memo,Amount,Status\n01/15/2025,2001,Acme LLC,Visa,500,Paid\n02/01/2025,2002,Acme LLC,Visa,600,Open\n";
  const auto = parseQboInvoices(csv);
  assert.equal(auto.drafts[0].date, "2025-01-15"); // 15 in the second slot → month-first inferred for the whole column
  assert.equal(auto.drafts[1].date, "2025-02-01");
  assert.equal(auto.drafts[0].status, "paid");
  assert.equal(auto.drafts[1].status, "sent");
  assert.ok(!auto.hasOpenBalanceColumn);
  assert.ok(auto.warnings.some((w) => /no Open Balance column/.test(w)));
  const forced = parseQboInvoices(csv, { dateFormat: "dmy" });
  assert.equal(forced.errors.length, 1); // 01/15 is not a valid day-first date
  assert.equal(forced.drafts[0].date, "2025-01-02");
});

test("QBO invoices: dedupe by document number against the store and within the file", () => {
  const r = parseQboInvoices(QBO_INVOICES_DMY, { dateFormat: "dmy" });
  const { fresh, duplicates } = dedupeInvoices(r.drafts, [{ qboDocNumber: "1041" }]);
  assert.deepEqual(fresh.map((d) => d.qboDocNumber), ["1042", "1043"]);
  assert.equal(duplicates.length, 1);
  assert.match(duplicates[0].reason, /already exists \(qbo-doc 1041\)/);
  const twice = dedupeInvoices([{ qboDocNumber: "7" }, { qboDocNumber: "7 " }], []);
  assert.equal(twice.fresh.length, 1);
  assert.match(twice.duplicates[0].reason, /repeated in the file/);
});
