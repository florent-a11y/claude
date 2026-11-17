import { ChartLine, Check, Megaphone, MessagesSquare, PackageCheck, ReceiptText, Users } from "lucide-react";
import type { Dictionary } from "@/content";
import { Reveal } from "./Reveal";

export const FUNCTION_IDS = ["messages", "sales", "finance", "operations", "team", "owner"] as const;
const ICONS = { messages: MessagesSquare, sales: Megaphone, finance: ReceiptText, operations: PackageCheck, team: Users, owner: ChartLine };

/**
 * The six areas of work. `examples` limits how many examples each card shows (all of them by default).
 * With `bento`, the first and last cards are wide, which gives the home page its uneven grid.
 */
export function FunctionGrid({ dict, examples, bento = false }: { dict: Dictionary; examples?: number; bento?: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {FUNCTION_IDS.map((id, index) => {
        const item = dict.functions[id];
        const Icon = ICONS[id];
        const wide = bento && (index === 0 || index === FUNCTION_IDS.length - 1);
        const fullWidth = bento && index === FUNCTION_IDS.length - 1;
        // The featured first card has the room for every example; the others show the short list.
        const shown = bento && index === 0 ? item.examples : item.examples.slice(0, examples);
        return (
          <Reveal
            as="article"
            key={id}
            delay={(index % 3) * 90}
            className={`card glow-card ${wide ? "md:col-span-2" : ""} ${fullWidth ? "lg:col-span-3" : ""}`}
          >
            <div className={wide ? "lg:flex lg:h-full lg:items-center lg:gap-10" : ""}>
              <div className={wide ? "lg:w-2/5 lg:shrink-0" : ""}>
                <span className={index === 0 ? "icon-chip-gold" : "icon-chip"}>
                  <Icon size={24} aria-hidden="true" />
                </span>
                <h3 className={`mt-5 font-bold text-ink-900 ${bento && index === 0 ? "text-2xl" : "text-xl"}`}>{item.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-600">{item.body}</p>
              </div>
              <ul className={`mt-5 space-y-2.5 ${wide ? "lg:mt-1 lg:flex-1" : ""} ${fullWidth ? "lg:grid lg:grid-cols-3 lg:gap-x-8 lg:space-y-0" : ""}`}>
                {shown.map((example) => (
                  <li key={example} className="flex gap-2.5 leading-snug text-ink-700">
                    <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
