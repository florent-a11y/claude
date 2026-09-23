import { site } from "@/lib/config";

export function DisclosureBar() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-center text-xs text-amber-900 sm:text-sm">
      <p className="mx-auto max-w-6xl px-4 py-2">
        Private assistance service, not the government. The arrival card is <strong>free</strong> at{" "}
        <a className="underline" href={site.officialPortal} rel="noopener nofollow" target="_blank">allindonesia.imigrasi.go.id</a>.
        Our fee covers preparation, checking and support.
      </p>
    </div>
  );
}
