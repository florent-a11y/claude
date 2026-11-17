/**
 * Site-wide settings. Everything a non-developer may need to change lives here or in the environment
 * (see .env.example): brand, contact channels and the public audit prices.
 */

function digitsOnly(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Public address of the site. NEXT_PUBLIC_SITE_URL wins when set (the real domain). Without it, a Vercel
 * deployment uses its own address: the production domain in production, the preview's address in a preview,
 * so links, the sitemap and link preview images work on a preview without any configuration.
 */
function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelHost = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : "http://localhost:3200";
}

export const site = {
  name: "Lancar AI",
  url: siteUrl(),
  /** WhatsApp number in international format, digits only (62812…). Empty until the business line exists. */
  whatsapp: digitsOnly(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
  email: (process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "").trim(),
  /** Registered company name, shown in the footer and the privacy notice once the company exists. */
  legalName: (process.env.NEXT_PUBLIC_LEGAL_NAME ?? "").trim(),
};

export type AuditTierId = "micro" | "small" | "medium";

/** On-site audit prices in rupiah. The fee is deducted from the implementation when the client goes ahead. */
export const AUDIT_TIERS: readonly { id: AuditTierId; minStaff: number; maxStaff: number; priceIdr: number }[] = [
  { id: "micro", minStaff: 1, maxStaff: 10, priceIdr: 3_500_000 },
  { id: "small", minStaff: 11, maxStaff: 50, priceIdr: 7_500_000 },
  { id: "medium", minStaff: 51, maxStaff: 200, priceIdr: 15_000_000 },
];

/** "Rp 3.500.000" for Indonesian, "IDR 3,500,000" for English. */
export function formatIdr(amount: number, locale: string) {
  return locale === "id"
    ? `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`
    : `IDR ${new Intl.NumberFormat("en-US").format(amount)}`;
}

/** wa.me link with a prefilled message, or null while no WhatsApp number is configured. */
export function whatsappLink(text: string) {
  return site.whatsapp ? `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}` : null;
}
