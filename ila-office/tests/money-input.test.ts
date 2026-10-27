import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRaw, formatRaw, rawToSubmit } from "../components/MoneyInput";
import { accountMatches, type AccountOption } from "../components/AccountPicker";

test("cleanRaw: typing digits keeps only digits for IDR (no decimals)", () => {
  assert.equal(cleanRaw("1", 0), "1");
  assert.equal(cleanRaw("1500000", 0), "1500000");
  assert.equal(cleanRaw("1,500,000", 0), "1500000"); // the box re-feeds its own formatted value
  assert.equal(cleanRaw("15abc00", 0), "1500");
  assert.equal(cleanRaw("1500.75", 0), "1500."); // IDR takes no decimals: the dot stays, the digits after it are refused
  assert.equal(cleanRaw("", 0), "");
  assert.equal(cleanRaw("abc", 0), "");
});

test("cleanRaw: pasted '1,000,000' and 'Rp'-style junk become raw digits", () => {
  assert.equal(cleanRaw("1,000,000", 0), "1000000");
  assert.equal(cleanRaw(" 1,000,000 ", 0), "1000000");
  assert.equal(cleanRaw("IDR 1,000,000", 0), "1000000");
  assert.equal(cleanRaw("1,000,000.50", 2), "1000000.50");
});

test("cleanRaw: USD keeps at most two decimals and a single dot", () => {
  assert.equal(cleanRaw("1234.5", 2), "1234.5");
  assert.equal(cleanRaw("1234.567", 2), "1234.56");
  assert.equal(cleanRaw("1234.", 2), "1234."); // trailing dot stays while typing
  assert.equal(cleanRaw("12.34.56", 2), "12.34");
  assert.equal(cleanRaw(".5", 2), ".5");
});

test("cleanRaw: negative only when allowed; a lone minus is kept so the sign can be typed first", () => {
  assert.equal(cleanRaw("-1500", 0, true), "-1500");
  assert.equal(cleanRaw("-1,500", 0, true), "-1500");
  assert.equal(cleanRaw("-1500", 0, false), "1500");
  assert.equal(cleanRaw("-1500", 0), "1500");
  assert.equal(cleanRaw("-", 0, true), "-");
  assert.equal(cleanRaw("-", 0, false), "");
  assert.equal(cleanRaw("15-00", 0, true), "1500"); // minus only counts at the start
  assert.equal(cleanRaw("-12.345", 2, true), "-12.34");
});

test("cleanRaw: leading zeros are dropped, a single zero and 0.x survive", () => {
  assert.equal(cleanRaw("007", 0), "7");
  assert.equal(cleanRaw("0", 0), "0");
  assert.equal(cleanRaw("00", 0), "0");
  assert.equal(cleanRaw("0.5", 2), "0.5");
  assert.equal(cleanRaw("00.5", 2), "0.5");
  assert.equal(cleanRaw("-007", 0, true), "-7");
});

test("formatRaw: thousands separators, decimals and sign", () => {
  assert.equal(formatRaw(""), "");
  assert.equal(formatRaw("1"), "1");
  assert.equal(formatRaw("999"), "999");
  assert.equal(formatRaw("1000"), "1,000");
  assert.equal(formatRaw("1000000"), "1,000,000");
  assert.equal(formatRaw("1500000"), "1,500,000");
  assert.equal(formatRaw("1234567.8"), "1,234,567.8");
  assert.equal(formatRaw("1234."), "1,234.");
  assert.equal(formatRaw(".5"), "0.5");
  assert.equal(formatRaw("-1500000"), "-1,500,000");
  assert.equal(formatRaw("-"), "-");
  assert.equal(formatRaw("0"), "0");
});

test("formatRaw ∘ cleanRaw: the box shows 1,000,000 once the user has typed 1000000", () => {
  let raw = "";
  for (const ch of "1000000") raw = cleanRaw(formatRaw(raw) + ch, 0);
  assert.equal(raw, "1000000");
  assert.equal(formatRaw(raw), "1,000,000");
  assert.equal(Number(raw), 1_000_000);
});

const accounts: AccountOption[] = [
  { id: "a1", code: "1-1100", name: "Bank IDR", type: "asset" },
  { id: "a2", code: "1-1110", name: "Bank USD", type: "asset" },
  { id: "a3", code: "1-1000", name: "Cash on hand", type: "asset" },
  { id: "r1", code: "4-1100", name: "Rental revenue (villa / property)", type: "revenue" },
  { id: "e1", code: "6-2100", name: "Depreciation expense", type: "expense" },
];
const find = (q: string) => accounts.filter((a) => accountMatches(a, q)).map((a) => a.id);

test("accountMatches: empty query matches everything", () => {
  assert.deepEqual(find(""), ["a1", "a2", "a3", "r1", "e1"]);
  assert.deepEqual(find("   "), ["a1", "a2", "a3", "r1", "e1"]);
});

test("accountMatches: code prefix", () => {
  assert.deepEqual(find("1-11"), ["a1", "a2"]);
  assert.deepEqual(find("1-1"), ["a1", "a2", "a3"]);
  assert.deepEqual(find("4-"), ["r1"]);
  assert.deepEqual(find("6-2100"), ["e1"]);
  assert.deepEqual(find("9-"), []);
});

test("accountMatches: name words in any order, case-insensitive", () => {
  assert.deepEqual(find("bank"), ["a1", "a2"]);
  assert.deepEqual(find("usd bank"), ["a2"]);
  assert.deepEqual(find("BANK usd"), ["a2"]);
  assert.deepEqual(find("Rental"), ["r1"]);
  assert.deepEqual(find("villa rental"), ["r1"]);
  assert.deepEqual(find("cash hand"), ["a3"]);
  assert.deepEqual(find("depr"), ["e1"]);
  assert.deepEqual(find("bank villa"), []);
});

test("accountMatches: words may mix code and name, extra spaces are ignored", () => {
  assert.deepEqual(find("1-11 usd"), ["a2"]);
  assert.deepEqual(find("  bank   idr  "), ["a1"]);
});


test("cleanRaw: Indonesian thousands dots and pasted formatted values for IDR", () => {
  assert.equal(cleanRaw("8.500.000", 0), "8500000");
  assert.equal(cleanRaw("Rp 8.750.500", 0), "8750500");
  assert.equal(cleanRaw("8.500", 0), "8500");
  assert.equal(cleanRaw("8,500,000", 0), "8500000");
  assert.equal(cleanRaw("8750500.75", 0), "8750500."); // decimals refused, dot kept until blur
  assert.equal(cleanRaw("8.", 0), "8."); // the dot stays while typing so the next digit is not appended
  assert.equal(rawToSubmit("8750500."), "8750500");
  assert.equal(rawToSubmit("-"), "");
  assert.equal(rawToSubmit("1234.5"), "1234.5");
  assert.equal(cleanRaw("1.234,56", 2), "1234.56"); // European decimal comma
  assert.equal(cleanRaw("1,234.56", 2), "1234.56");
});
