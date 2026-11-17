"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { HERO_CHAT } from "@/lib/hero-chat";

type Labels = { business: string; status: string; staffNote: string; typing: string; fictional: string };

/** Messages rendered on the server, so the hero is meaningful before (and without) JavaScript. */
const INITIAL_VISIBLE = 3;
const GUEST_DELAY_MS = 2000;
const TYPING_MS = 1300;
const NOTE_DELAY_MS = 700;
const LOOP_PAUSE_MS = 7000;

/**
 * A chat window that plays a scripted multilingual conversation. With `animated` off, or when the visitor
 * prefers reduced motion, the whole conversation is shown at once.
 */
export function HeroChat({ labels, animated = true }: { labels: Labels; animated?: boolean }) {
  const [visible, setVisible] = useState(animated ? INITIAL_VISIBLE : HERO_CHAT.length);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!animated) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(HERO_CHAT.length);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const play = (shown: number) => {
      if (shown >= HERO_CHAT.length) {
        timer = setTimeout(() => {
          setVisible(0);
          play(0);
        }, LOOP_PAUSE_MS);
        return;
      }
      const next = HERO_CHAT[shown];
      const reveal = () => {
        setTyping(false);
        setVisible(shown + 1);
        play(shown + 1);
      };
      if (next.from === "assistant") {
        setTyping(true);
        timer = setTimeout(reveal, TYPING_MS);
      } else {
        timer = setTimeout(reveal, next.from === "note" ? NOTE_DELAY_MS : GUEST_DELAY_MS);
      }
    };
    play(INITIAL_VISIBLE);
    return () => clearTimeout(timer);
  }, [animated]);

  return (
    // The gradient frame: a one-pixel border that runs from blue to gold.
    <div className="rounded-[2.1rem] bg-gradient-to-br from-azure-400/80 via-white/10 to-gold-400/80 p-px shadow-[0_40px_120px_-30px_rgba(47,107,255,0.7)]">
      <div className="overflow-hidden rounded-[2.05rem] bg-night-900">
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-200 to-gold-500 text-base font-extrabold text-night-950">
            SE
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight text-white">{labels.business}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-mist-300">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              {labels.status}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold text-mist-300">{labels.fictional}</span>
        </div>
        <div className={`flex flex-col justify-end gap-2.5 overflow-hidden px-4 py-4 ${animated ? "h-[25rem]" : ""}`}>
          {HERO_CHAT.slice(0, visible).map((message, index) =>
            message.from === "note" ? (
              <p
                key={index}
                className="bubble-in mx-auto flex max-w-[92%] items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-3.5 py-1.5 text-center text-[13px] font-semibold text-gold-200"
              >
                <BellRing size={14} aria-hidden="true" className="shrink-0" />
                {labels.staffNote}
              </p>
            ) : (
              <p
                key={index}
                lang={message.lang}
                className={`bubble-in max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
                  message.from === "guest" ? "self-start rounded-tl-md bg-white/10 text-white" : "self-end rounded-tr-md bg-azure-600 text-white"
                }`}
              >
                {message.text}
              </p>
            ),
          )}
          {typing && (
            <p className="bubble-in flex gap-1 self-end rounded-2xl rounded-tr-md bg-azure-600 px-4 py-3.5" aria-label={labels.typing}>
              <span className="typing-dot h-2 w-2 rounded-full bg-white" />
              <span className="typing-dot h-2 w-2 rounded-full bg-white" />
              <span className="typing-dot h-2 w-2 rounded-full bg-white" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
