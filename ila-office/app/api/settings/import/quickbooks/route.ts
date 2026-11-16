import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { QBO_MAX_FILE_BYTES } from "@/lib/qbo-migration";
import {
  addWizardFile, buildMigrationPlan, checkMigration, discardWizard, loadMigrationWorld, loadWizard, loadWizardTables, moveWizard, planView, removeWizardFile, runMigration,
  setWizardFileKind, setWizardOptions, trimCheck, type WizardFile,
} from "@/lib/qbo-migration-services";
import { companyNeedsBooks, createEntityFromInput, entityInputFromCompany } from "@/app/settings/entities/create-entity";
import type { Company, Entity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A long journal history is planned and posted in one request: allow the platform maximum. */
export const maxDuration = 300;

/**
 * "Migrate a company from QuickBooks" (admin). The page sends the exports here in several requests, because the
 * platform refuses a body over 4.5 MB.
 *
 * - POST multipart {target, file…}: reads each export (up to 4 MB per file and per request), recognises its
 *   QuickBooks report and keeps it server-side with the pending migration. One result per file.
 * - POST JSON {action}: `state` (pending files), `kind` (override a detection), `remove`, `discard`, `plan` (the
 *   combined dry run), `run` (creates the books of a company without books, imports everything, checks the trial
 *   balance, deletes the uploads) and `check` {entityId} (the comparison with QuickBooks again, later).
 *
 * `target` is `entity:<id>` (a set of books) or `company:<id>` (a client company without books yet).
 */

interface Target { key: string; entity: Entity; virtual: boolean; company?: Company; names: string[] }

async function resolveTarget(key: string): Promise<Target | null> {
  const i = key.indexOf(":");
  const type = key.slice(0, i), id = key.slice(i + 1);
  if (type === "entity") {
    const entity = await db.get("entities", id);
    return entity ? { key, entity, virtual: false, names: [entity.name, entity.legalName] } : null;
  }
  if (type !== "company") return null;
  const company = await db.get("companies", id);
  if (!company) return null;
  const entity = company.entityId ? await db.get("entities", company.entityId) : null;
  if (entity) return { key, entity, virtual: false, company, names: [entity.name, entity.legalName, company.name] };
  // No books yet: the dry run plans against the entity and the standard chart the migration will create.
  return { key, entity: { ...entityInputFromCompany(company), id: `new:${company.id}`, createdAt: new Date().toISOString() }, virtual: true, company, names: [company.name] };
}

const optionsSchema = z.object({
  dateFormat: z.enum(["auto", "dmy", "mdy", "ymd"]),
  fxRates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customersToDirectory: z.boolean().optional(),
});
const targetKey = z.string().regex(/^(entity|company):[\w-]{1,80}$/);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("state"), target: targetKey }),
  z.object({ action: z.literal("kind"), target: targetKey, fileId: z.string().max(80), kind: z.enum(["accounts", "journal", "trial_balance", "general_ledger", "invoices", "bills", "customers", "vendors", "unknown"]) }),
  z.object({ action: z.literal("remove"), target: targetKey, fileId: z.string().max(80) }),
  z.object({ action: z.literal("discard"), target: targetKey }),
  z.object({ action: z.literal("plan"), target: targetKey, options: optionsSchema.optional() }),
  z.object({ action: z.literal("run"), target: targetKey, options: optionsSchema.optional() }),
  z.object({ action: z.literal("check"), entityId: z.string().max(80) }),
]);

const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "private, no-store" } });
const ok = (data: object) => Response.json(data, { headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request) {
  const user = await guard("admin");
  if (user instanceof Response) return user;
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const fd = await req.formData();
      const key = targetKey.safeParse(String(fd.get("target") ?? ""));
      const target = key.success ? await resolveTarget(key.data) : null;
      if (!target) return fail("Choose the company first.");
      const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length === 0) return fail("No file received.");
      if (files.reduce((s, f) => s + f.size, 0) > QBO_MAX_FILE_BYTES) return fail("More than 4 MB in one request: send the files in several requests.", 413);
      const results: Array<{ name: string; file?: WizardFile; error?: string }> = [];
      for (const f of files) {
        try { results.push({ name: f.name, file: await addWizardFile(user.id, target.key, f.name || "export.xlsx", Buffer.from(await f.arrayBuffer()), target.names) }); }
        catch (e) { results.push({ name: f.name, error: e instanceof Error ? e.message : String(e) }); }
      }
      return ok({ results, draft: await loadWizard(user.id, target.key) });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Unknown request.");
    const body = parsed.data;

    if (body.action === "check") {
      const entity = await db.get("entities", body.entityId);
      if (!entity) return fail("Books not found.", 404);
      const r = await checkMigration(entity, user.id);
      if (!r) return fail("No QuickBooks trial balance was given for this company yet: upload one (Reports › Trial Balance) to run the check.");
      revalidatePath("/settings/import/quickbooks");
      return ok({ entityId: entity.id, entityName: entity.name, check: trimCheck(r.check) });
    }

    const target = await resolveTarget(body.target);
    if (!target) return fail("Company not found.", 404);
    if (body.action === "state") return ok({ draft: await loadWizard(user.id, target.key) });
    if (body.action === "kind") return ok({ draft: await setWizardFileKind(user.id, target.key, body.fileId, body.kind) });
    if (body.action === "remove") return ok({ draft: await removeWizardFile(user.id, target.key, body.fileId) });
    if (body.action === "discard") { await discardWizard(user.id, target.key); return ok({ draft: await loadWizard(user.id, target.key) }); }

    const draft = body.options ? await setWizardOptions(user.id, target.key, body.options) : await loadWizard(user.id, target.key);
    const dryRun = async () => buildMigrationPlan(await loadMigrationWorld(target.entity, target.virtual), await loadWizardTables(user.id, draft), draft.options);
    if (body.action === "plan") return ok({ draft, plan: planView(await dryRun()) });

    // run
    if (draft.files.length === 0) return fail("Nothing is pending: upload the QuickBooks exports first.");
    let { entity, key } = target;
    let booksCreated = false;
    if (target.virtual) {
      if (!target.company || !companyNeedsBooks(target.company)) return fail("This company is not an active client with a legal form: set its type and status in Clients › Companies before creating its books.");
      const plan = await dryRun(); // nothing is created when the plan cannot run
      if (plan.blocking) return fail(plan.blocking);
      entity = await createEntityFromInput(entityInputFromCompany(target.company));
      booksCreated = true;
      key = `entity:${entity.id}`;
      await moveWizard(user.id, target.key, key);
    }
    const result = await runMigration({ id: user.id, name: user.name }, key, entity);
    for (const p of ["/settings/import", "/settings/import/quickbooks", "/settings/entities", "/books", `/books/${entity.id}`, "/clients/companies", "/clients/vendors", "/clients/contacts", "/"]) revalidatePath(p);
    const { trialBalance: _tb, ...migration } = result.migration;
    return ok({ ...result, migration, target: key, booksCreated });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
