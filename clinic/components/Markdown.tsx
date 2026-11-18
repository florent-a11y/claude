import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId } from "@/lib/blog";
import { PHOTOS, type PhotoKey } from "@/lib/photos";
import { Photo } from "./Photo";

/** Text inside a heading, whatever mix of strings and elements it is made of. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

/**
 * Renders an article written in Markdown. Raw HTML in the text is not interpreted, so an article cannot inject
 * scripts. Pictures come from the site's own library: write ![description](photo:vials-row).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="article">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("photo:") ? url : defaultUrlTransform(url))}
        components={{
          h1: ({ children: c }) => <h2 id={headingId(textOf(c))}>{c}</h2>, // the page already has its one main title
          h2: ({ children: c }) => <h2 id={headingId(textOf(c))}>{c}</h2>,
          h3: ({ children: c }) => <h3 id={headingId(textOf(c))}>{c}</h3>,
          a: ({ href = "", children: c }) => (/^https?:\/\//.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{c}</a> : <a href={href}>{c}</a>),
          table: ({ children: c }) => <div className="article-table"><table>{c}</table></div>,
          img: ({ src, alt }) => {
            const key = typeof src === "string" && src.startsWith("photo:") ? src.slice(6) : "";
            if (!(key in PHOTOS)) return null;
            return <Photo name={key as PhotoKey} alt={alt ?? ""} sizes="(min-width: 768px) 720px, 100vw" className="my-8 aspect-[16/9] rounded-3xl" />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
