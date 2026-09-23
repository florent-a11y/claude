import Link from "next/link";
import { site, DISCLOSURE } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-500">
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{DISCLOSURE}</p>
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="font-semibold text-ink-900">{site.company}</p>
            <p>{site.address}</p>
            <p>{site.companyReg}</p>
            <p className="mt-2"><a className="underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></p>
          </div>
          <div>
            <p className="font-semibold text-ink-900">Service</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/apply">Apply for assistance</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/faq">FAQ</Link></li>
              <li><Link href="/contact">Contact & support</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink-900">Free resources</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/guide">Do it yourself guide</Link></li>
              <li><Link href="/customs">Customs allowances</Link></li>
              <li><Link href="/news">Official news summaries</Link></li>
              <li><a href={site.officialPortal} rel="noopener nofollow" target="_blank">Official government portal ↗</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink-900">Legal</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/legal/disclosure">Non-affiliation disclosure</Link></li>
              <li><Link href="/legal/terms">Terms of service</Link></li>
              <li><Link href="/legal/privacy">Privacy policy</Link></li>
              <li><Link href="/legal/refunds">Refund policy</Link></li>
            </ul>
          </div>
        </div>
        <p className="mt-8">© {new Date().getFullYear()} {site.company}. All rights reserved.</p>
      </div>
    </footer>
  );
}
