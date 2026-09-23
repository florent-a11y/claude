"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileMenu({ items }: { items: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation and on Escape; lock body scroll while open.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-nav" className="grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-brand-50" onClick={() => setOpen(!open)}>
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 h-screen bg-black/30" onClick={() => setOpen(false)}>
          <nav id="mobile-nav" aria-label="Mobile" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-slate-200 bg-white px-4 pb-6 pt-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} onClick={() => setOpen(false)} className={`block py-3 text-base font-medium ${pathname === n.href ? "text-brand-600" : "text-ink-900"}`}>{n.label}</Link>
                </li>
              ))}
            </ul>
            <Link href="/apply" onClick={() => setOpen(false)} className="btn-primary mt-4 w-full">Start my application</Link>
          </nav>
        </div>
      )}
    </div>
  );
}
