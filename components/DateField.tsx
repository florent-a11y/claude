"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/routing";

export type DateRange = "birth" | "passportIssued" | "passportExpiry" | "travel";

/** Three dropdowns (day, month, year) that read and write a YYYY-MM-DD string. Easier than the native
 *  picker on desktop Safari and on phones, where scrolling year by year to a 1980s birth date is painful. */
export function DateField({ value, onChange, range, required, className = "" }: {
  value: string; onChange: (v: string) => void; range: DateRange; required?: boolean; className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("Common");
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const [from, to] =
      range === "birth" ? [thisYear, thisYear - 100] :
      range === "passportIssued" ? [thisYear, thisYear - 11] :
      range === "passportExpiry" ? [thisYear, thisYear + 15] :
      [thisYear, thisYear + 2];
    const step = to < from ? -1 : 1;
    const out: number[] = [];
    for (let y = from; step < 0 ? y >= to : y <= to; y += step) out.push(y);
    return out;
  }, [range, thisYear]);
  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { month: "long" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)));
  }, [locale]);

  // Keep the three parts locally so a half-filled date (e.g. day chosen before year) is not lost.
  const parse = (v: string): [number, number, number] => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? (v.split("-").map(Number) as [number, number, number]) : [0, 0, 0]);
  const [[y, m, d], setParts] = useState<[number, number, number]>(() => parse(value));
  useEffect(() => { if (value && value !== toIso(y, m, d)) setParts(parse(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 31;

  function toIso(ny: number, nm: number, nd: number) {
    if (!ny || !nm || !nd) return "";
    const day = Math.min(nd, new Date(ny, nm, 0).getDate());
    return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function emit(ny: number, nm: number, nd: number) {
    setParts([ny, nm, nd]);
    onChange(toIso(ny, nm, nd));
  }
  const sel = "input !px-2 !py-2.5";
  return (
    <div className={`grid grid-cols-[4.5rem_1fr_5.5rem] gap-2 ${className}`}>
      <select className={sel} aria-label={t("day")} required={required} value={d || ""} onChange={(e) => emit(y, m, Number(e.target.value))}>
        <option value="">{t("day")}</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select className={sel} aria-label={t("month")} required={required} value={m || ""} onChange={(e) => emit(y, Number(e.target.value), d)}>
        <option value="">{t("month")}</option>
        {months.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
      </select>
      <select className={sel} aria-label={t("year")} required={required} value={y || ""} onChange={(e) => emit(Number(e.target.value), m, d)}>
        <option value="">{t("year")}</option>
        {years.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}
