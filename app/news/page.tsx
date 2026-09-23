import type { Metadata } from "next";
import { listNews } from "@/lib/store";
import { site } from "@/lib/config";

export const metadata: Metadata = { title: "Official immigration and customs news, summarized", description: "Plain-English summaries of announcements from Indonesia's Directorate General of Immigration and Customs, with links to the original source." };
export const revalidate = 3600;

const labels = { imigrasi: "Ditjen Imigrasi", beacukai: "Bea Cukai", other: "Official source" };

const evergreen = [
  { title: "All Indonesia arrival card is mandatory at all international entry points", text: "Since 1 October 2025 every international arrival must submit the digital arrival card within 72 hours before arrival and present the QR code with their passport.", url: site.officialPortal },
  { title: "Cash of IDR 100 million or more must be declared", text: "Bringing IDR 100,000,000 or more (or foreign currency equivalent) into or out of Indonesia requires a declaration to Customs.", url: "https://www.beacukai.go.id/" },
];

export default async function News() {
  let items: Awaited<ReturnType<typeof listNews>> = [];
  try { items = await listNews(40); } catch { items = []; }
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Official news, summarized for travelers</h1>
      <p className="mt-2 text-ink-700">Short English summaries of announcements published by the Indonesian immigration and customs authorities. Each item links to the original. We are not the source and do not speak for these authorities.</p>

      <h2 className="mt-10 text-xl font-bold">Key rules in force</h2>
      <ul className="mt-4 space-y-4">
        {evergreen.map((e) => (
          <li key={e.title} className="card"><h3 className="font-semibold">{e.title}</h3><p className="mt-1 text-sm text-ink-700">{e.text}</p><a className="mt-2 inline-block text-sm text-brand-600 underline" href={e.url} target="_blank" rel="noopener nofollow">Official source ↗</a></li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold">Latest announcements</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-ink-500">The feed is refreshed twice a week from the official sites. No items yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((n) => (
            <li key={n.id} className="card">
              <p className="text-xs font-semibold uppercase text-brand-600">{labels[n.source]} · {new Date(n.publishedAt).toLocaleDateString("en-GB")}</p>
              <h3 className="mt-1 font-semibold">{n.title}</h3>
              {n.summary && <p className="mt-1 text-sm text-ink-700">{n.summary}</p>}
              <a className="mt-2 inline-block text-sm text-brand-600 underline" href={n.url} target="_blank" rel="noopener nofollow">Read the original ↗</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
