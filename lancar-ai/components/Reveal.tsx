import type { CSSProperties, ElementType, ReactNode } from "react";

/** Inline style carrying an animation delay, read by .rise and .reveal in globals.css. */
export function delay(ms: number): CSSProperties {
  return { "--delay": `${ms}ms` } as CSSProperties;
}

/**
 * A block that fades up when it scrolls into view (components/Effects.tsx adds the visible state).
 * `delay` staggers neighbours: pass index * 90 in a list.
 */
export function Reveal({
  as: Tag = "div",
  delay: ms = 0,
  className = "",
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={`reveal ${className}`} style={ms ? delay(ms) : undefined}>
      {children}
    </Tag>
  );
}
