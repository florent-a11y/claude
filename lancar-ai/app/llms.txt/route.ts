import { en } from "@/content/en";
import { AUDIT_TIERS, formatIdr, site } from "@/lib/config";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

/** /llms.txt: a plain-text summary of the business for AI assistants that read websites on a user's behalf. */
export function GET() {
  const tiers = AUDIT_TIERS.map((tier) => `- ${en.pricing.audit.tiers[tier.id].staff}: ${formatIdr(tier.priceIdr, "en")}`).join("\n");
  const text = `# ${site.name}

> ${en.meta.description}

${site.name} is an AI consultancy for small and medium businesses in Bali and Greater Jakarta, Indonesia. Consultants visit the business, study how the team works, recommend where AI saves time, build the solutions and train the staff. Work is done in Indonesian and English.

## How it works
1. Free 30-minute discovery call.
2. On-site audit with a written report. The fee is deducted from the implementation if the client goes ahead.
3. Implementation at a fixed price per solution, with staff training.
4. Optional monthly accompaniment.

## On-site audit prices
${tiers}

## Pages
- [Services](${absoluteUrl("en", "/services")}): what can be set up
- [How we work](${absoluteUrl("en", "/how-we-work")}): the method and what the audit report contains
- [Sectors](${absoluteUrl("en", "/sectors")}): hospitality and wellness, restaurants and retail, clinics and services, trading and manufacturing
- [Pricing](${absoluteUrl("en", "/pricing")})
- [Live demo](${absoluteUrl("en", "/demo")}): chat with an AI assistant for a fictional business
- [Readiness quiz](${absoluteUrl("en", "/quiz")})
- [Contact](${absoluteUrl("en", "/contact")})
- [Versi bahasa Indonesia](${absoluteUrl("id", "/")})
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
