// ISO 3166-1 alpha-2 → English name. Localized names live in messages/<locale>.json under "Countries";
// this map is the source of truth for the ops console, emails and the message catalog.
export const COUNTRIES: Record<string, string> = {
  AU: "Australia", AT: "Austria", BE: "Belgium", BR: "Brazil", CA: "Canada", CL: "Chile", CN: "China",
  CZ: "Czechia", DK: "Denmark", EG: "Egypt", FI: "Finland", FR: "France", DE: "Germany", GR: "Greece",
  HK: "Hong Kong SAR", HU: "Hungary", IN: "India", ID: "Indonesia", IE: "Ireland", IL: "Israel", IT: "Italy",
  JP: "Japan", KR: "South Korea", MY: "Malaysia", MX: "Mexico", NL: "Netherlands", NZ: "New Zealand",
  NO: "Norway", PH: "Philippines", PL: "Poland", PT: "Portugal", QA: "Qatar", RU: "Russia", SA: "Saudi Arabia",
  SG: "Singapore", ZA: "South Africa", ES: "Spain", SE: "Sweden", CH: "Switzerland", TW: "Taiwan",
  TH: "Thailand", TR: "Türkiye", UA: "Ukraine", AE: "United Arab Emirates", GB: "United Kingdom",
  US: "United States", VN: "Vietnam", AR: "Argentina", BD: "Bangladesh", PK: "Pakistan", LK: "Sri Lanka",
  NP: "Nepal", KZ: "Kazakhstan", RO: "Romania", BG: "Bulgaria", HR: "Croatia", SK: "Slovakia", SI: "Slovenia",
  LT: "Lithuania", LV: "Latvia", EE: "Estonia", LU: "Luxembourg", MT: "Malta", CY: "Cyprus", IS: "Iceland",
  MA: "Morocco", TN: "Tunisia", KE: "Kenya", NG: "Nigeria", CO: "Colombia", PE: "Peru", KH: "Cambodia",
  LA: "Laos", MM: "Myanmar", BN: "Brunei", MO: "Macao SAR", MN: "Mongolia", OM: "Oman", KW: "Kuwait",
  BH: "Bahrain", JO: "Jordan", LB: "Lebanon", IR: "Iran", IQ: "Iraq", GE: "Georgia", AM: "Armenia",
  AZ: "Azerbaijan", UZ: "Uzbekistan", MV: "Maldives", FJ: "Fiji", PG: "Papua New Guinea", TL: "Timor-Leste",
  RS: "Serbia", BA: "Bosnia and Herzegovina", MK: "North Macedonia", AL: "Albania", ME: "Montenegro",
  BY: "Belarus", MD: "Moldova", UY: "Uruguay", EC: "Ecuador", VE: "Venezuela", CR: "Costa Rica", PA: "Panama",
  DO: "Dominican Republic", GH: "Ghana", ET: "Ethiopia", TZ: "Tanzania", UG: "Uganda", DZ: "Algeria",
};

export const countryList = Object.entries(COUNTRIES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Country options with localized names (from a "Countries" message lookup), sorted for the locale. */
export function localizedCountries(name: (code: string) => string | undefined, locale: string) {
  return Object.keys(COUNTRIES)
    .map((code) => ({ code, name: name(code) ?? COUNTRIES[code] }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** `key` is the message key under Options.ports (codes with "-" are not valid message keys). */
export const PORTS_OF_ENTRY = [
  { code: "CGK", key: "CGK", name: "Jakarta – Soekarno-Hatta (CGK)" },
  { code: "DPS", key: "DPS", name: "Bali – Ngurah Rai (DPS)" },
  { code: "SUB", key: "SUB", name: "Surabaya – Juanda (SUB)" },
  { code: "KNO", key: "KNO", name: "Medan – Kualanamu (KNO)" },
  { code: "UPG", key: "UPG", name: "Makassar – Sultan Hasanuddin (UPG)" },
  { code: "YIA", key: "YIA", name: "Yogyakarta – YIA" },
  { code: "LOP", key: "LOP", name: "Lombok – Zainuddin Abdul Madjid (LOP)" },
  { code: "MDC", key: "MDC", name: "Manado – Sam Ratulangi (MDC)" },
  { code: "BTH", key: "BTH", name: "Batam – Hang Nadim (BTH)" },
  { code: "BPN", key: "BPN", name: "Balikpapan – SAMS Sepinggan (BPN)" },
  { code: "KJT", key: "KJT", name: "Kertajati (KJT)" },
  { code: "BTM-SEA", key: "BTM_SEA", name: "Batam Centre ferry terminal (sea)" },
  { code: "TNJ-SEA", key: "TNJ_SEA", name: "Tanjung Pinang ferry terminal (sea)" },
  { code: "LAND", key: "LAND", name: "Land border (Entikong / Aruk / Motaain / other)" },
  { code: "OTHER", key: "OTHER", name: "Other international entry point" },
] as const;

/** The English label is what gets stored in the order (and copied to the official form);
 *  `key` is the message key under Options.purposes for the localized label. */
export const PURPOSE_OPTIONS = [
  { key: "holiday", value: "Holiday / tourism" },
  { key: "family", value: "Visiting family or friends" },
  { key: "business", value: "Business meeting / conference" },
  { key: "work", value: "Work (with work permit)" },
  { key: "study", value: "Study" },
  { key: "medical", value: "Medical treatment" },
  { key: "transit", value: "Transit" },
  { key: "other", value: "Other" },
] as const;
export const PURPOSES = PURPOSE_OPTIONS.map((p) => p.value);

/** Same convention as PURPOSE_OPTIONS; message keys under Options.visaTypes. */
export const VISA_TYPE_OPTIONS = [
  { key: "visaFree", value: "Visa-free entry" },
  { key: "voa", value: "Visa on Arrival (VOA) – paid at airport" },
  { key: "evoa", value: "e-VOA (electronic visa on arrival)" },
  { key: "evisa", value: "e-Visa (B211A, C1, C2, D1, D2, etc.)" },
  { key: "kitas", value: "KITAS / KITAP holder" },
  { key: "diplomatic", value: "Diplomatic / official" },
  { key: "unsure", value: "Not sure – please advise" },
] as const;
export const VISA_TYPES = VISA_TYPE_OPTIONS.map((p) => p.value);
