"use client";
import { useEffect, useRef } from "react";

/** True until the first page has been shown: the entrance animation is for moving between pages, not for the first load. */
let firstLoad = true;

/** Remounts on every navigation, which lets each new page ease in. */
export default function Template({ children }: { children: React.ReactNode }) {
  const animate = useRef(!firstLoad);
  useEffect(() => { firstLoad = false; }, []);
  return <div className={animate.current ? "page-enter" : undefined}>{children}</div>;
}
