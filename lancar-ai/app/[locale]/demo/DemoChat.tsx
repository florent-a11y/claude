"use client";

import { useEffect, useRef, useState } from "react";
import { Info, RotateCcw, Send } from "lucide-react";
import { fill, type Dictionary } from "@/content";
import { DEMO_LIMITS, isPersonaId, PERSONA_IDS, PERSONAS, type PersonaId } from "@/lib/demo";
import { HeroChat } from "@/components/HeroChat";

type Turn = { role: "user" | "assistant"; content: string };
type Notice = "limit" | "tooLong" | "error" | "declined" | null;

export function DemoChat({
  labels,
  heroLabels,
}: {
  labels: Dictionary["demo"];
  heroLabels: React.ComponentProps<typeof HeroChat>["labels"];
}) {
  const [live, setLive] = useState<boolean | null>(null);
  const [business, setBusiness] = useState<PersonaId>("spa");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sector pages link here with ?business=clinic and so on. Read in the browser so the page stays static.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("business");
    if (isPersonaId(requested)) setBusiness(requested);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo-chat")
      .then((response) => response.json() as Promise<{ live?: boolean }>)
      .then((data) => !cancelled && setLive(Boolean(data.live)))
      .catch(() => !cancelled && setLive(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, waiting]);

  const persona = labels.personas[business];
  const atLimit = turns.length >= DEMO_LIMITS.maxMessages - 1;

  function reset(next: PersonaId = business) {
    setBusiness(next);
    setTurns([]);
    setDraft("");
    setNotice(null);
  }

  async function send(text: string) {
    const content = text.trim().slice(0, DEMO_LIMITS.maxMessageChars);
    if (!content || waiting) return;
    if (atLimit) {
      setNotice("tooLong");
      return;
    }
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setDraft("");
    setNotice(null);
    setWaiting(true);
    try {
      const response = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, messages: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { reply?: string; declined?: boolean };
      if (response.ok && data.reply) {
        setTurns([...next, { role: "assistant", content: data.reply }]);
      } else if (response.ok && data.declined) {
        // Keep the conversation valid for the next request: drop the message that got no answer.
        setTurns(turns);
        setNotice("declined");
      } else {
        setTurns(turns);
        setDraft(content);
        if (response.status === 503) setLive(false);
        else setNotice(response.status === 429 ? "limit" : "error");
      }
    } catch {
      setTurns(turns);
      setDraft(content);
      setNotice("error");
    } finally {
      setWaiting(false);
      inputRef.current?.focus();
    }
  }

  const noticeText =
    notice === "limit" ? labels.limit : notice === "tooLong" ? labels.tooLong : notice ? labels.error : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
      <div>
        <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-gold-700">{labels.choose}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {PERSONA_IDS.map((id) => {
            const item = labels.personas[id];
            const selected = id === business;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => reset(id)}
                className={`rounded-2xl border-2 px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-azure-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                  selected ? "border-gold-400 bg-gold-400/10" : "border-cloud-200 bg-white hover:border-azure-400/70 hover:bg-white"
                }`}
              >
                <span className="block text-lg font-bold text-ink-900">{item.name}</span>
                <span className="block text-ink-600">
                  {item.kind} · {item.place}
                </span>
              </button>
            );
          })}
        </div>
        <details className="mt-6 rounded-2xl border border-cloud-200 bg-white px-5 py-4">
          <summary className="cursor-pointer font-bold text-azure-600">{labels.factSheet}</summary>
          <p className="mt-3 text-sm text-ink-500">{labels.factSheetNote}</p>
          <pre lang="en" className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
            {PERSONAS[business].factSheet}
          </pre>
        </details>
      </div>

      <div>
        {live === false ? (
          <>
            <p className="mb-4 flex gap-2.5 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-4 py-3 font-semibold text-gold-700">
              <Info size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
              {labels.offline}
            </p>
            <HeroChat labels={heroLabels} animated={false} />
          </>
        ) : (
          <div className="rounded-[2.1rem] bg-gradient-to-br from-azure-400/80 via-cloud-300 to-gold-400/80 p-px shadow-[0_40px_120px_-40px_rgba(47,107,255,0.7)]">
          <div className="overflow-hidden rounded-[2.05rem] bg-cloud-50">
            <div className="flex items-center gap-3 border-b border-cloud-200 bg-white px-5 py-4 text-ink-900">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold leading-tight">{persona.name}</p>
                <p className="truncate text-sm text-ink-600">
                  {persona.kind} · {heroLabels.fictional}
                </p>
              </div>
              <button
                type="button"
                onClick={() => reset()}
                disabled={turns.length === 0}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cloud-200 px-3 py-1.5 text-sm font-semibold hover:bg-cloud-100 disabled:opacity-40"
              >
                <RotateCcw size={14} aria-hidden="true" />
                {labels.reset}
              </button>
            </div>

            <div ref={scroller} role="log" aria-live="polite" className="flex h-[26rem] flex-col gap-2.5 overflow-y-auto px-4 py-4">
              <p className="max-w-[85%] self-start rounded-2xl rounded-tl-md bg-cloud-100 px-3.5 py-2.5 text-[15px] leading-snug text-ink-900">
                {fill(labels.greeting, { name: persona.name })}
              </p>
              {turns.map((turn, index) => (
                <p
                  key={index}
                  dir="auto"
                  className={`bubble-in max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
                    turn.role === "assistant" ? "self-start rounded-tl-md bg-cloud-100 text-ink-900" : "self-end rounded-tr-md bg-azure-600 text-white"
                  }`}
                >
                  {turn.content}
                </p>
              ))}
              {waiting && (
                <p className="bubble-in flex gap-1 self-start rounded-2xl rounded-tl-md bg-cloud-100 px-4 py-3.5" aria-label={labels.typing}>
                  <span className="typing-dot h-2 w-2 rounded-full bg-ink-600" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-ink-600" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-ink-600" />
                </p>
              )}
              {turns.length === 0 && !waiting && (
                <div className="mt-auto">
                  <p className="mb-2 text-sm font-semibold text-ink-500">{labels.suggestionsLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {PERSONAS[business].suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={live !== true}
                        onClick={() => send(suggestion)}
                        className="rounded-full border border-azure-400/40 bg-azure-500/10 px-3.5 py-2 text-left text-[15px] font-semibold text-azure-600 transition hover:border-gold-400/60 hover:bg-gold-400/10 hover:text-azure-700 disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {noticeText && (
              <p role="alert" className="border-t border-gold-400/30 bg-gold-400/10 px-5 py-3 font-semibold text-gold-700">
                {noticeText}
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
              className="flex items-center gap-2 border-t border-cloud-200 bg-white p-3"
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={DEMO_LIMITS.maxMessageChars}
                placeholder={labels.placeholder}
                aria-label={labels.placeholder}
                autoComplete="off"
                dir="auto"
                className="min-w-0 flex-1 rounded-full border border-cloud-200 bg-white px-4 py-3 text-base text-ink-900 placeholder:text-ink-500 focus:border-azure-400 focus:outline-none focus:ring-2 focus:ring-azure-400/30"
              />
              <button
                type="submit"
                disabled={live !== true || waiting || !draft.trim()}
                aria-label={labels.send}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-200 to-gold-500 text-night-950 transition hover:brightness-110 disabled:opacity-40"
              >
                <Send size={20} aria-hidden="true" />
              </button>
            </form>
          </div>
          </div>
        )}
        <p className="mt-4 text-sm leading-relaxed text-ink-500">{labels.disclaimer}</p>
      </div>
    </div>
  );
}
