"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getProduct, type Goal } from "@/lib/catalog";
import { ProductCard } from "./ProductCard";

/** Product grid with "chosen for" filter chips. Takes slugs so the server page stays in charge of what is listed. */
export function CatalogGrid({ slugs, filter = true }: { slugs: string[]; filter?: boolean }) {
  const g = useTranslations("Goals");
  const l = useTranslations("Listing");
  const products = useMemo(() => slugs.map(getProduct).filter((p) => p !== undefined), [slugs]);
  const goals = useMemo(() => {
    const seen: Goal[] = [];
    for (const p of products) for (const goal of p.goals) if (!seen.includes(goal)) seen.push(goal);
    return seen;
  }, [products]);
  const [goal, setGoal] = useState<Goal | "all">("all");
  const shown = goal === "all" ? products : products.filter((p) => p.goals.includes(goal));
  return (
    <div>
      {filter && goals.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label={g("all")}>
          {(["all", ...goals] as const).map((x) => (
            <button key={x} type="button" aria-pressed={goal === x} onClick={() => setGoal(x)}
              className={`chip cursor-pointer px-4 py-2 text-sm transition ${goal === x ? "chip-on" : "hover:border-deep-800/50"}`}>
              {g(x)}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className="text-ink-500">{l("empty")}</p> : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      )}
    </div>
  );
}
