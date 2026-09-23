/**
 * The zod schemas in lib/schema.ts keep English messages (they also run on the server and in the ops tooling).
 * The forms map those English messages to the "Validation" namespace by key so users see them in their language.
 */
const EXACT: Record<string, string> = {
  "Required": "required",
  "Use YYYY-MM-DD": "date",
  "Check passport number": "passportNumber",
  "Passport scan is required": "passportScan",
  "Passport photo is required": "passportPhoto",
  "You must accept the terms": "acceptTerms",
  "Please confirm you understand this is not a government website": "acknowledgeNotGov",
  "e-VOA details are required": "evoaRequired",
  "Enter a valid email": "email",
  "Invalid email address": "email",
  "Arrival date must be today or in the future": "arrivalFuture",
  "Please agree to receive the reminder email": "consent",
};

/** Message key under "Validation" for an English zod message, or null when the text is not a known validation message. */
export function validationKey(message: string): string | null {
  if (EXACT[message]) return EXACT[message];
  if (/^Too small/i.test(message)) return "tooShort";
  if (/^Too big/i.test(message)) return "tooLong";
  if (/^Invalid email/i.test(message)) return "email";
  if (/^Invalid input: expected .*received undefined/i.test(message)) return "required";
  if (/^Documents missing for traveler/.test(message)) return "documentsMissing";
  if (/^(Invalid|Expected|Unrecognized)/i.test(message)) return "invalid";
  return null;
}

/** Numbers found in a message ("Documents missing for traveler 2, 3" → "2, 3"), for the {list} argument. */
export function messageList(message: string) {
  return message.replace(/^[^\d]*/, "");
}
