import { site } from "./config";
import type { Post } from "./blog";
import { localizedPath } from "@/i18n/routing";

/** An article as clean Markdown, with its facts up front: the form AI assistants read most reliably. */
export function postMarkdown(post: Post): string {
  const url = `${site.url}${localizedPath(post.locale, `/blog/${post.slug}`)}`;
  return [
    `# ${post.title}`,
    "",
    `> ${post.excerpt}`,
    "",
    `- Source: ${url}`,
    `- Publisher: ${site.name}`,
    post.author ? `- Author: ${post.author}` : "",
    post.reviewer ? `- Medically reviewed by: ${post.reviewer}` : "",
    post.publishedAt ? `- Published: ${post.publishedAt.slice(0, 10)}` : "",
    `- Updated: ${post.updatedAt.slice(0, 10)}`,
    `- Language: ${post.locale}`,
    "",
    ...(post.takeaways.length ? ["## Key takeaways", "", ...post.takeaways.map((k) => `- ${k}`), ""] : []),
    post.body.trim().replace(/!\[[^\]]*\]\(photo:[^)]*\)\n?/g, ""),
    "",
    ...(post.faq.length ? ["## Questions and answers", "", ...post.faq.flatMap((f) => [`### ${f.q}`, "", f.a, ""])] : []),
    ...(post.sources.length ? ["## Sources", "", ...post.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`), ""] : []),
    "General information, not medical advice.",
    "",
  ].filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

