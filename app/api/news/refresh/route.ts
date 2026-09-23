import { NextResponse } from "next/server";
import { collectNews, summarize } from "@/lib/news";
import { listNews, upsertNews } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = new Set((await listNews(500)).map((n) => n.id));
  const fresh = (await collectNews()).filter((n) => !existing.has(n.id));
  const summarized = await summarize(fresh.slice(0, 20));
  const count = await upsertNews(summarized);
  return NextResponse.json({ found: fresh.length, saved: count });
}
