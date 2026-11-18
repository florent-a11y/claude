import type { MetadataRoute } from "next";
import { demoMode, site } from "@/lib/config";

const PRIVATE = ["/admin", "/api/orders", "/api/leads", "/api/admin", "/api/webhooks", "/cart", "/checkout", "/order/", "/ru/cart", "/ru/checkout", "/ru/order/", "/fr/cart", "/fr/checkout", "/fr/order/"];

/**
 * Crawlers of AI assistants and AI search, named one by one so the choice is explicit: they may read the public
 * pages (that is how the site gets quoted and linked in AI answers) but not the private ones. To refuse one,
 * move it to a rule with `disallow: "/"`.
 */
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", // OpenAI: training, search index, live browsing
  "ClaudeBot", "Claude-SearchBot", "Claude-User", // Anthropic
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", // Gemini and AI Overviews grounding
  "Applebot-Extended", "Amazonbot", "Meta-ExternalAgent", "MistralAI-User", "DuckAssistBot", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  // A test site stays out of search engines and AI indexes entirely.
  if (demoMode()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt", "/api/blog/", "/api/feed/"], disallow: PRIVATE },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
