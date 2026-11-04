import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtRate, parseBiDate, parseBiRatesPage, parseRate, perUnit, rateToSubmit } from "../lib/fx-core";
import { fxRateId, pageToRates } from "../lib/fx";

test("parseRate reads rates typed the English or the Indonesian way, with or without decimals", () => {
  assert.equal(parseRate("16500"), 16500);
  assert.equal(parseRate("16,500.25"), 16500.25);
  assert.equal(parseRate("16.500,25"), 16500.25);
  assert.equal(parseRate("16500,25"), 16500.25);
  assert.equal(parseRate("16500.25"), 16500.25);
  assert.equal(parseRate("16.500"), 16500, "a single separator before three digits groups thousands");
  assert.equal(parseRate("Rp 16.500"), 16500);
  assert.equal(parseRate("105.1234"), 105.1234, "four decimals are kept");
  assert.equal(parseRate("105.12345"), 105.1235, "more are rounded to four");
  assert.equal(parseRate(""), 0);
  assert.equal(parseRate("abc"), 0);
  assert.equal(parseRate(16245.5), 16245.5);
});

test("fmtRate and rateToSubmit", () => {
  assert.equal(fmtRate(16245.5), "16,245.50");
  assert.equal(fmtRate(16245), "16,245.00");
  assert.equal(fmtRate(105.1234), "105.1234");
  assert.equal(fmtRate(0), "");
  assert.equal(rateToSubmit(16245.5), "16245.5");
  assert.equal(rateToSubmit(0), "");
});

test("parseBiDate reads English and Indonesian month names", () => {
  assert.equal(parseBiDate("4 November 2026"), "2026-11-04");
  assert.equal(parseBiDate(" 30 Oktober 2026 "), "2026-10-30");
  assert.equal(parseBiDate("30/10/2026"), "2026-10-30");
  assert.equal(parseBiDate("nothing"), null);
});

// A cut-down copy of the markup of BI's Kurs Transaksi page (en): "Last Update" caption and the rate table.
const SAMPLE = `
<div class="statistik-rtgs-white"><span>
  Last Update
  &nbsp;
  4 November 2026
</span></div>
<table class="table">
<thead><tr><th>Currency</th><th>Value</th><th>Sell</th><th>Buy</th><th></th></tr></thead>
<tbody>
<tr class='table-body-om'> <td class="text-center">AUD </td> <td class="text-center">1.00</td> <td class="text-center">11,912.34</td> <td class="text-center">11,790.12</td> <td class="text-center"><input type="submit" value="View" /></td> </tr>
<tr class='table-body-om'> <td class="text-center">JPY </td> <td class="text-center">100.00</td> <td class="text-center">11,870.50</td> <td class="text-center">11,750.00</td> <td class="text-center"><input type="submit" value="View" /></td> </tr>
<tr class='table-body-om'> <td class="text-center">USD </td> <td class="text-center">1.00</td> <td class="text-center">18,238.74</td> <td class="text-center">18,057.26</td> <td class="text-center"><input type="submit" value="View" /></td> </tr>
</tbody></table>
<table><tbody><tr class='table-body-om'><td>USD</td><td>US DOLLAR</td></tr><tr><td>VND</td><td>VIETNAMESE DONG</td></tr></tbody></table>`;

test("parseBiRatesPage reads the Last Update date and the code / unit / sell / buy rows", () => {
  const page = parseBiRatesPage(SAMPLE);
  assert.equal(page.asOf, "2026-11-04");
  assert.deepEqual(page.rows.map((r) => r.currency), ["AUD", "JPY", "USD"], "the code list without numbers is not a rate row");
  const usd = page.rows.find((r) => r.currency === "USD")!;
  assert.deepEqual(usd, { currency: "USD", units: 1, sell: 18238.74, buy: 18057.26 });
  const jpy = page.rows.find((r) => r.currency === "JPY")!;
  assert.equal(jpy.units, 100);
  assert.deepEqual(perUnit(jpy), { buy: 117.5, sell: 118.705, mid: 118.1 }, "JPY is quoted per 100 and brought back to 1 unit");
  assert.deepEqual(perUnit(usd), { buy: 18057.26, sell: 18238.74, mid: 18148 });
});

test("parseBiRatesPage also reads the Indonesian number format and tolerates swapped rate columns", () => {
  const page = parseBiRatesPage(`Update Terakhir&nbsp;30 Oktober 2026 <table><tr><td>EUR</td><td>1,00</td><td>19.100,00</td><td>19.300,50</td></tr></table>`);
  assert.equal(page.asOf, "2026-10-30");
  assert.deepEqual(page.rows, [{ currency: "EUR", units: 1, sell: 19300.5, buy: 19100 }]);
});

test("parseBiRatesPage returns no rows for a page without the table", () => {
  const page = parseBiRatesPage("<html><body>Maintenance</body></html>");
  assert.equal(page.asOf, null);
  assert.equal(page.rows.length, 0);
});

test("pageToRates keys the cache rows by currency and publication day with per-unit mid rates", () => {
  const rows = pageToRates(parseBiRatesPage(SAMPLE), "2026-11-04T05:00:00.000Z");
  assert.equal(rows.length, 3);
  const jpy = rows.find((r) => r.currency === "JPY")!;
  assert.equal(jpy.id, fxRateId("jpy", "2026-11-04"));
  assert.equal(jpy.date, "2026-11-04");
  assert.equal(jpy.rateDate, "2026-11-04");
  assert.equal(jpy.mid, 118.1);
  assert.equal(jpy.units, 100);
  assert.equal(jpy.source, "bi");
  assert.equal(pageToRates({ asOf: null, rows: [] }).length, 0);
});
