"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact = false, className = "nav-link", activeClassName = "nav-link-active", children }: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} className={`${className} ${active ? activeClassName : ""}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
