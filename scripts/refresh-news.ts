// Local run: npx tsx scripts/refresh-news.ts   (needs .env loaded, e.g. `set -a; source .env; set +a`)
import { collectNews, summarize } from "../lib/news";
import { listNews, upsertNews } from "../lib/store";

async function main() {
  const existing = new Set((await listNews(500)).map((n) => n.id));
  const fresh = (await collectNews()).filter((n) => !existing.has(n.id));
  const saved = await upsertNews(await summarize(fresh.slice(0, 20)));
  console.log(`found ${fresh.length}, saved ${saved}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
