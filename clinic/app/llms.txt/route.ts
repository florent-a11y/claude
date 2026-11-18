import { NextResponse } from "next/server";
import en from "@/messages/en.json";
import { PRODUCTS, type Kind } from "@/lib/catalog";
import { site } from "@/lib/config";
import { defaultLlmsFacts, seoSettings } from "@/lib/seo";
import { allPublishedPosts } from "@/lib/posts";
import { localizedPath } from "@/i18n/routing";

export const runtime = "nodejs";
export const revalidate = 300;

const items = en.Catalog.items as Record<string, { name: string; tagline: string }>;
const SECTION: Array<[Kind, string]> = [["iv", "IV drips"], ["shot", "Injections"], ["peptide", "Peptides and injectables (doctor review required)"], ["supplement", "Supplements"], ["membership", "Memberships"]];

/**
 * /llms.txt: a short, plain map of the site for AI assistants (the llmstxt.org convention). It says who we are,
 * what we do and do not do, and links the pages and articles worth reading, with Markdown versions of the articles.
 */
export async function GET() {
  const u = (path: string) => `${site.url}${path}`;
  const posts = await allPublishedPosts();
  const { llmsFacts } = await seoSettings();
  const facts = llmsFacts.length ? llmsFacts : defaultLlmsFacts();
  const byLocale = (l: string) => posts.filter((p) => p.locale === l);
  const lines = [
    `# ${site.name}`,
    "",
    `> ${en.Metadata.description}`,
    "",
    "Facts that are safe to state about this business:",
    ...facts.map((f) => `- ${f}`),
    "",
    "## Main pages",
    "",
    `- [IV drips](${u("/iv-drips")}): ${en.Listing.iv.intro}`,
    `- [Peptides and injectables](${u("/peptides")}): ${en.Listing.peptides.intro}`,
    `- [Supplements](${u("/supplements")}): ${en.Listing.supplements.intro}`,
    `- [Memberships](${u("/memberships")}): ${en.Listing.memberships.intro}`,
    `- [How it works](${u("/how-it-works")}): ${en.HowItWorks.intro}`,
    `- [Delivery and service areas](${u("/delivery")}): zones, delivery fees, nurse call-out fees and arrival windows.`,
    `- [Frequently asked questions](${u("/faq")}): ${en.Faq.intro}`,
    `- [Journal](${u("/blog")}): ${en.Blog.intro}`,
    "",
    ...SECTION.flatMap(([kind, title]) => [
      `## ${title}`,
      "",
      ...PRODUCTS.filter((p) => p.kind === kind).map((p) => `- [${items[p.slug]?.name ?? p.slug}](${u(`/treatments/${p.slug}`)}): ${items[p.slug]?.tagline ?? ""} Price: IDR ${p.priceIdr.toLocaleString("en-US")}.${p.rx ? " Doctor review required." : ""}`),
      "",
    ]),
    ...(posts.length ? [
      "## Articles",
      "",
      ...byLocale("en").map((p) => `- [${p.title}](${u(`/api/blog/en/${p.slug}`)}): ${p.excerpt} (web page: ${u(localizedPath("en", `/blog/${p.slug}`))})`),
      ...(byLocale("ru").length ? ["", "### Russian", "", ...byLocale("ru").map((p) => `- [${p.title}](${u(`/api/blog/ru/${p.slug}`)}): ${p.excerpt}`)] : []),
      ...(byLocale("fr").length ? ["", "### French", "", ...byLocale("fr").map((p) => `- [${p.title}](${u(`/api/blog/fr/${p.slug}`)}): ${p.excerpt}`)] : []),
      "",
    ] : []),
    "## Policies",
    "",
    `- [Medical disclaimer](${u("/legal/medical")})`,
    `- [Terms of service](${u("/legal/terms")})`,
    `- [Privacy policy](${u("/legal/privacy")})`,
    `- [Cancellations and refunds](${u("/legal/refunds")})`,
    "",
    "## Languages",
    "",
    `- English: ${u("/")}`,
    `- Russian: ${u("/ru")}`,
    `- French: ${u("/fr")}`,
    "",
  ];
  return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
