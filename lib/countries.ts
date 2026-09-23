// ISO 3166-1 alpha-2 → name. Sorted by name at render time.
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

export const PORTS_OF_ENTRY = [
  { code: "CGK", name: "Jakarta – Soekarno-Hatta (CGK)" },
  { code: "DPS", name: "Bali – Ngurah Rai (DPS)" },
  { code: "SUB", name: "Surabaya – Juanda (SUB)" },
  { code: "KNO", name: "Medan – Kualanamu (KNO)" },
  { code: "UPG", name: "Makassar – Sultan Hasanuddin (UPG)" },
  { code: "YIA", name: "Yogyakarta – YIA" },
  { code: "LOP", name: "Lombok – Zainuddin Abdul Madjid (LOP)" },
  { code: "MDC", name: "Manado – Sam Ratulangi (MDC)" },
  { code: "BTH", name: "Batam – Hang Nadim (BTH)" },
  { code: "BPN", name: "Balikpapan – SAMS Sepinggan (BPN)" },
  { code: "KJT", name: "Kertajati (KJT)" },
  { code: "BTM-SEA", name: "Batam Centre ferry terminal (sea)" },
  { code: "TNJ-SEA", name: "Tanjung Pinang ferry terminal (sea)" },
  { code: "LAND", name: "Land border (Entikong / Aruk / Motaain / other)" },
  { code: "OTHER", name: "Other international entry point" },
];

export const PURPOSES = [
  "Holiday / tourism",
  "Visiting family or friends",
  "Business meeting / conference",
  "Work (with work permit)",
  "Study",
  "Medical treatment",
  "Transit",
  "Other",
];

export const VISA_TYPES = [
  "Visa-free entry",
  "Visa on Arrival (VOA) – paid at airport",
  "e-VOA (electronic visa on arrival)",
  "e-Visa (B211A, C1, C2, D1, D2, etc.)",
  "KITAS / KITAP holder",
  "Diplomatic / official",
  "Not sure – please advise",
];
