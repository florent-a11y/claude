/**
 * Indonesia e-VOA (electronic Visa on Arrival, index B1) reference data.
 * Eligibility is verified by our team against the official list at the time of submission.
 */
export const EVOA = {
  validityDays: 30,
  extendableOnceDays: 30,
  governmentFeeIdr: 500_000,
  passportMinValidityMonths: 6,
  applyWindowDays: 90, // may apply up to ~90 days before the intended entry date
  typicalProcessing: "same day to 2 working days",
};

/** ASEAN nationals enter visa-free for 30 days and do not need an e-VOA. */
export const VISA_FREE_ASEAN = ["BN", "KH", "LA", "MY", "MM", "PH", "SG", "TH", "VN", "TL"];

/** Nationalities eligible for e-VOA (major markets; the full list is ~97 countries). */
export const EVOA_ELIGIBLE = [
  "AR", "AU", "AT", "BE", "BR", "BG", "CA", "CL", "CN", "CO", "HR", "CY", "CZ", "DK", "EG", "EE", "FI", "FR", "DE", "GR", "HK",
  "HU", "IS", "IN", "IE", "IT", "JP", "JO", "KZ", "KE", "KR", "KW", "LV", "LT", "LU", "MO", "MT", "MX", "MA", "NL", "NZ", "NO",
  "OM", "PK", "PE", "PL", "PT", "QA", "RO", "RU", "SA", "RS", "SK", "SI", "ZA", "ES", "SE", "CH", "TW", "TN", "TR", "UA", "AE",
  "GB", "US", "UY", "UZ", "VE", "EC", "PA", "GE", "AM", "AZ", "BH", "BY", "MD", "MK", "AL", "ME", "BA", "MV", "FJ", "PG", "MN", "NG", "GH", "DZ",
];

export type Eligibility = "visa_free" | "evoa" | "check";
export function eligibility(nationality: string): Eligibility {
  if (VISA_FREE_ASEAN.includes(nationality)) return "visa_free";
  if (EVOA_ELIGIBLE.includes(nationality)) return "evoa";
  return "check";
}

export const EVOA_PURPOSES: Array<{ value: "tourism" | "business" | "family" | "transit" | "official"; label: string }> = [
  { value: "tourism", label: "Tourism / holiday" },
  { value: "business", label: "Business meeting, conference, purchasing" },
  { value: "family", label: "Visiting family or friends" },
  { value: "transit", label: "Transit" },
  { value: "official", label: "Government / official duties" },
];
