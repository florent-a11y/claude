import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { migrationState } from "@/lib/qbo-migration";
import { loadMigrations } from "@/lib/qbo-migration-services";
import { companyNeedsBooks } from "@/app/settings/entities/create-entity";
import { Page } from "@/components/ui";
import { MigrationWizard, type CompanyStatus, type TargetOption } from "./MigrationWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Migrate from QuickBooks" };

/**
 * Settings → Import → Migrate a company from QuickBooks (admin). Guided, per company: choose the company, drop every
 * QuickBooks export at once, review one plan in the right order, import, and see the proof that the trial balance
 * equals QuickBooks. The work is done by POST /api/settings/import/quickbooks (lib/qbo-migration-services.ts); this
 * page lists the companies and each one's migration status.
 */
export default async function QuickbooksMigrationPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  await requirePermission("admin");
  const sp = await searchParams;
  const [entities, companies] = await Promise.all([db.list("entities", { orderBy: "name" }), db.list("companies", { orderBy: "name" })]);
  const books = entities.filter((e) => e.status !== "closed");
  const migrations = await loadMigrations(books.map((e) => e.id));
  const targets: TargetOption[] = [
    ...books.map((e) => ({ key: `entity:${e.id}`, label: `${e.isOwn ? "★ " : ""}${e.name}`, hasBooks: true, isOwn: e.isOwn })),
    ...companies.filter(companyNeedsBooks).map((c) => ({ key: `company:${c.id}`, label: c.name, hasBooks: false, isOwn: false })),
  ];
  const statuses: CompanyStatus[] = books.map((e) => {
    const m = migrations.get(e.id);
    return {
      entityId: e.id, name: e.name, isOwn: e.isOwn, state: migrationState(m), files: m?.files ?? [], counts: m?.counts, lastCheck: m?.lastCheck,
      trialBalance: m?.trialBalance ? { fileName: m.trialBalance.fileName, asOf: m.trialBalance.asOf } : undefined, updatedAt: m?.updatedAt,
    };
  });
  return (
    <Page
      title="Migrate a company from QuickBooks"
      subtitle="Complete history, one company at a time: chart of accounts, every journal entry, open invoices and bills, then a check of the trial balance against QuickBooks."
      breadcrumbs={[{ href: "/settings/entities", label: "Settings" }, { href: "/settings/import", label: "Import" }, { label: "QuickBooks migration" }]}
      actions={<Link href="/settings/import" className="btn-secondary">Single files</Link>}
    >
      <MigrationWizard targets={targets} statuses={statuses} initialTarget={targets.some((t) => t.key === sp.target) ? sp.target : undefined} />
    </Page>
  );
}
