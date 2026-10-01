import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { ENTITY_TYPE_LABELS } from "@/lib/types";
import { Badge, statusTone } from "@/components/ui";
import { BooksTabs } from "./BooksTabs";
import { base, requireEntity, type Params } from "./shared";

export const dynamic = "force-dynamic";

export default async function BooksLayout({ params, children }: { params: Params; children: ReactNode }) {
  await requireUser();
  const { entityId } = await params;
  const entity = await requireEntity(entityId);
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/books" className="text-xs text-ink-500 hover:underline">Books</Link><span className="text-xs text-ink-500">/</span>
          <h1 className="text-lg font-bold tracking-tight">{entity.isOwn && <span className="mr-1 text-accent-600">★</span>}{entity.name}</h1>
          <span className="text-xs text-ink-500">{ENTITY_TYPE_LABELS[entity.type]} · {entity.baseCurrency}{entity.tax.pkp ? ` · PKP ${Math.round(entity.tax.ppnRate * 100)}%` : " · non-PKP"} · FY starts month {entity.fiscalYearStartMonth}</span>
          <Badge tone={statusTone(entity.status)}>{entity.status}</Badge>
        </div>
        <Link href={`/settings/entities/${entity.id}`} className="text-xs text-brand-600 underline">Entity settings</Link>
      </div>
      <BooksTabs base={base(entityId)} />
      {children}
    </div>
  );
}
