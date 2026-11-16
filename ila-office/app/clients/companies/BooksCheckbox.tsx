"use client";
import { useEffect, useRef } from "react";
import { booksBoxAfterTypeChange } from "@/app/settings/entities/entity-sync";

/**
 * "ILA keeps the books" on the company form. A plain checkbox read by the server action as `keepBooks`; the only
 * script is that it follows the Type select of the same form (a prospect has no books; on the new-company form a legal
 * form ticks it), and the user can still change it afterwards.
 */
export function BooksCheckbox({ defaultChecked, isNew }: { defaultChecked: boolean; isNew: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const box = ref.current;
    const type = box?.form?.elements.namedItem("type");
    if (!box || !(type instanceof HTMLSelectElement)) return;
    let previous = type.value;
    const onChange = () => { box.checked = booksBoxAfterTypeChange(box.checked, previous, type.value, isNew); previous = type.value; };
    type.addEventListener("change", onChange);
    return () => type.removeEventListener("change", onChange);
  }, [isNew]);
  return (
    <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <input ref={ref} type="checkbox" name="keepBooks" defaultChecked={defaultChecked} className="checkbox mt-0.5" />
      <span>
        ILA keeps the books for this company <span className="text-ink-500">(creates its chart of accounts; it then appears under Books, Tax and Payroll)</span>
        <span className="mt-1 block text-xs text-ink-500">The books start with the default tax profile (normal CIT 22%, not PKP, no payroll, LKPM for a PT PMA), to be reviewed in Settings → Entities.</span>
      </span>
    </label>
  );
}
