"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ShoppingBag, Check, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProduct } from "@/lib/catalog";
import type { CartItem } from "@/lib/schema";

const KEY = "clinic-basket-v1";
const MAX_QTY = 10;

interface CartApi {
  items: CartItem[];
  /** False until the saved basket has been read from the browser (avoids a flash of "empty basket"). */
  ready: boolean;
  count: number;
  add: (slug: string) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
}
const Ctx = createContext<CartApi | null>(null);

function maxFor(slug: string) {
  return getProduct(slug)?.kind === "membership" ? 1 : MAX_QTY;
}

/** Basket kept in the browser (localStorage). Prices are never stored: they are read from the catalogue. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
      if (Array.isArray(raw)) {
        setItems(raw.filter((i): i is CartItem => Boolean(i && typeof i.slug === "string" && getProduct(i.slug) && Number.isInteger(i.qty) && i.qty > 0))
          .map((i) => ({ slug: i.slug, qty: Math.min(i.qty, maxFor(i.slug)) })));
      }
    } catch { /* unreadable storage: start empty */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode: keep it in memory */ }
  }, [items, ready]);

  const add = useCallback((slug: string) => setItems((cur) => {
    const found = cur.find((i) => i.slug === slug);
    if (found) return cur.map((i) => (i.slug === slug ? { ...i, qty: Math.min(i.qty + 1, maxFor(slug)) } : i));
    return [...cur, { slug, qty: 1 }];
  }), []);
  const setQty = useCallback((slug: string, qty: number) => setItems((cur) =>
    qty <= 0 ? cur.filter((i) => i.slug !== slug) : cur.map((i) => (i.slug === slug ? { ...i, qty: Math.min(qty, maxFor(slug)) } : i))), []);
  const remove = useCallback((slug: string) => setItems((cur) => cur.filter((i) => i.slug !== slug)), []);
  const clear = useCallback(() => setItems([]), []);

  const api = useMemo<CartApi>(() => ({ items, ready, count: items.reduce((s, i) => s + i.qty, 0), add, setQty, remove, clear }), [items, ready, add, setQty, remove, clear]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useCart must be used inside <CartProvider>");
  return api;
}

export function CartButton() {
  const t = useTranslations("Common");
  const { count, ready } = useCart();
  const shown = ready ? count : 0;
  return (
    <Link href="/cart" aria-label={t("basketCount", { count: shown })} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-deep-900 transition hover:bg-mist-100">
      <ShoppingBag className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
      {shown > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-400 px-1 text-[11px] font-bold text-deep-950">{shown}</span>
      )}
    </Link>
  );
}

/** "Add to basket" / "Add to booking". After a click it confirms and offers the basket. */
export function AddToCart({ slug, session, className = "btn-primary", compact = false }: { slug: string; session: boolean; className?: string; compact?: boolean }) {
  const t = useTranslations("Common");
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(false), 4000);
    return () => window.clearTimeout(id);
  }, [added]);

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" className={`${className} ${compact ? "btn-sm" : ""}`} onClick={() => { add(slug); setAdded(true); }}>
        {added ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        <span aria-live="polite">{added ? t("added") : session ? t("addToBooking") : t("addToCart")}</span>
      </button>
      {added && <Link href="/cart" className="text-sm font-semibold text-deep-700 underline underline-offset-4">{t("viewBasket")}</Link>}
    </span>
  );
}
