import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { buildSystemPrompt, DEMO_LIMITS, DEMO_MODEL, isPersonaId } from "@/lib/demo";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** A reply is a few sentences; allow for a slow first token. */
export const maxDuration = 60;

function isLive() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The chat window asks this first, to decide between the live assistant and the recorded example. */
export function GET() {
  return NextResponse.json({ live: isLive() });
}

type ChatTurn = { role: "user" | "assistant"; content: string };

/** The conversation as sent by the browser, or null when it breaks a limit or is malformed. */
function parseTurns(value: unknown): ChatTurn[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > DEMO_LIMITS.maxMessages) return null;
  const turns: ChatTurn[] = [];
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, content } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > DEMO_LIMITS.maxMessageChars) return null;
    total += text.length;
    turns.push({ role, content: text });
  }
  if (total > DEMO_LIMITS.maxTotalChars) return null;
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

export async function POST(request: Request) {
  if (!isLive()) return NextResponse.json({ error: "offline" }, { status: 503 });
  if (!rateLimit(`demo:${clientIp(request)}`, DEMO_LIMITS.requestsPerWindow, DEMO_LIMITS.windowMs)) {
    return NextResponse.json({ error: "limit" }, { status: 429 });
  }

  let body: { business?: unknown; messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const turns = parseTurns(body.messages);
  if (!isPersonaId(body.business) || !turns) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const client = new Anthropic();
  try {
    // Streamed from the API so a slow answer cannot hit an HTTP timeout, but sent to the browser in one piece:
    // a WhatsApp reply arrives whole, and a declined or rerouted answer is never shown half-written.
    const message = await client.beta.messages
      .stream({
        model: DEMO_MODEL,
        max_tokens: DEMO_LIMITS.maxOutputTokens,
        output_config: { effort: "low" },
        // If the model's safety classifiers decline a message, the API retries it on Anthropic's recommended
        // fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: buildSystemPrompt(body.business),
        messages: turns,
      })
      .finalMessage();

    if (message.stop_reason === "refusal") return NextResponse.json({ declined: true });

    // After a mid-answer fallback, only the text that follows the last switch is the final answer.
    const lastSwitch = message.content.findLastIndex((block) => block.type === "fallback");
    const reply = message.content
      .slice(lastSwitch + 1)
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!reply) return NextResponse.json({ declined: true });
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("[demo-chat] the Anthropic API key was rejected:", error.message);
      return NextResponse.json({ error: "offline" }, { status: 503 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[demo-chat] Anthropic rate or spend limit reached:", error.message);
      return NextResponse.json({ error: "limit" }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[demo-chat] Anthropic API error ${error.status}:`, error.message);
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    console.error("[demo-chat] unexpected error:", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
