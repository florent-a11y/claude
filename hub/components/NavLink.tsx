"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact = false, also, className = "nav-link", activeClassName = "nav-link-active", children }: {
  href: string;
  exact?: boolean;
  /** An extra path that should also count as active (e.g. a sub-page). */
  also?: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")) || (!!also && (pathname === also || pathname.startsWith(also + "/")));
  return (
    <Link href={href} className={`${className} ${active ? activeClassName : ""}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
