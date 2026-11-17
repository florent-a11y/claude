import { ChartLine, Check, Megaphone, MessagesSquare, PackageCheck, ReceiptText, Users } from "lucide-react";
import type { Dictionary } from "@/content";

export const FUNCTION_IDS = ["messages", "sales", "finance", "operations", "team", "owner"] as const;
const ICONS = { messages: MessagesSquare, sales: Megaphone, finance: ReceiptText, operations: PackageCheck, team: Users, owner: ChartLine };

/** The six areas of work. `examples` limits how many examples each card shows (all of them by default). */
export function FunctionGrid({ dict, examples }: { dict: Dictionary; examples?: number }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {FUNCTION_IDS.map((id) => {
        const item = dict.functions[id];
        const Icon = ICONS[id];
        return (
          <article key={id} className="card">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sea-50 text-sea-700">
              <Icon size={24} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-ink-950">{item.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-600">{item.body}</p>
            <ul className="mt-5 space-y-2.5">
              {item.examples.slice(0, examples).map((example) => (
                <li key={example} className="flex gap-2.5 leading-snug text-ink-800">
                  <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-sea-600" />
                  {example}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
