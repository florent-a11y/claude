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
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#efe9df] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-3 bg-sea-700 px-5 py-4 text-white">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-base font-extrabold">
          SE
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{labels.business}</p>
          <p className="truncate text-sm text-white/75">{labels.status}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">{labels.fictional}</span>
      </div>
      <div
        className={`flex flex-col justify-end gap-2.5 overflow-hidden px-4 py-4 ${animated ? "h-[25rem]" : ""}`}
      >
        {HERO_CHAT.slice(0, visible).map((message, index) =>
          message.from === "note" ? (
            <p
              key={index}
              className="bubble-in mx-auto flex max-w-[92%] items-center gap-2 rounded-full bg-marigold-200 px-3.5 py-1.5 text-center text-[13px] font-semibold text-ink-900"
            >
              <BellRing size={14} aria-hidden="true" className="shrink-0" />
              {labels.staffNote}
            </p>
          ) : (
            <p
              key={index}
              lang={message.lang}
              className={`bubble-in max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug text-ink-950 shadow-sm ${
                message.from === "guest" ? "self-start rounded-tl-md bg-white" : "self-end rounded-tr-md bg-[#d9fdd3]"
              }`}
            >
              {message.text}
            </p>
          ),
        )}
        {typing && (
          <p className="bubble-in flex gap-1 self-end rounded-2xl rounded-tr-md bg-[#d9fdd3] px-4 py-3.5" aria-label={labels.typing}>
            <span className="typing-dot h-2 w-2 rounded-full bg-ink-600" />
            <span className="typing-dot h-2 w-2 rounded-full bg-ink-600" />
            <span className="typing-dot h-2 w-2 rounded-full bg-ink-600" />
          </p>
        )}
      </div>
    </div>
  );
}
