/** Field options and patterns shared by the lead form (browser) and the lead API (server). */
export const LEAD_LOCATIONS = ["bali", "jakarta", "other"] as const;
export const LEAD_SECTORS = ["hospitality", "food", "services", "trading", "other"] as const;
export const LEAD_TEAMS = ["micro", "small", "medium"] as const;

/** A phone number with optional +, 8 to 15 digits, spaces, dots, dashes and brackets allowed between them. */
export const WHATSAPP_PATTERN = /^\+?(?:[\s().-]*\d){8,15}[\s().-]*$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
