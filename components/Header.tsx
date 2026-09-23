import Link from "next/link";
import { site } from "@/lib/config";
import { MobileMenu } from "./MobileMenu";

export const NAV = [
  { href: "/apply", label: "Arrival card" },
  { href: "/reminder", label: "Reminder" },
  { href: "/evoa", label: "e-VOA visa" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guide", label: "How it works" },
  { href: "/customs", label: "Customs" },
  { href: "/news", label: "Official news" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">✈</span>
          <span>{site.shortName}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium text-ink-700 lg:flex">
          {NAV.slice(0, 8).map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-brand-600">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/apply" className="btn-primary hidden !px-4 !py-2 text-sm sm:inline-flex">Start</Link>
          <MobileMenu items={NAV} />
        </div>
      </div>
    </header>
  );
}
