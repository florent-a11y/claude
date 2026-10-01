import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_PROBABILITY, SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type Deal } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { companyOptions, contactOptions, sortedCompanies, sortedContacts, userOptions, type Lookups } from "../_lib/server";

const SOURCES = ["", "referral", "website", "instagram", "google", "partner", "event", "existing client", "other"];

export function DealForm({ deal, l, action, defaults = {} }: { deal?: Deal; l: Lookups; action: (fd: FormData) => Promise<void>; defaults?: Partial<Pick<Deal, "companyId" | "contactId" | "title" | "amount" | "currency" | "category">> }) {
  const d = deal;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Deal</h2>
        <Field label="Title"><input name="title" defaultValue={d?.title ?? defaults.title} required className="input" placeholder="PT PMA incorporation + 2 investor KITAS" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company"><Select name="companyId" defaultValue={d?.companyId ?? defaults.companyId ?? ""} options={companyOptions(sortedCompanies(l))} /></Field>
          <Field label="Contact"><Select name="contactId" defaultValue={d?.contactId ?? defaults.contactId ?? ""} options={contactOptions(sortedContacts(l))} /></Field>
          <Field label="Amount"><input name="amount" type="number" min={0} step="any" defaultValue={d?.amount ?? defaults.amount ?? 0} className="input" /></Field>
          <Field label="Currency"><Select name="currency" defaultValue={d?.currency ?? defaults.currency ?? "IDR"} options={["IDR", "USD", "EUR", "HKD"]} /></Field>
          <Field label="Category"><Select name="category" defaultValue={d?.category ?? defaults.category ?? ""} options={[{ value: "", label: "— choose —" }, ...SERVICE_CATEGORIES.map((c) => ({ value: c, label: SERVICE_CATEGORY_LABELS[c] }))]} /></Field>
          <Field label="Source"><Select name="source" defaultValue={d?.source ?? ""} options={SOURCES.map((s) => ({ value: s, label: s || "— unknown —" }))} /></Field>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Pipeline</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage" hint="Closing as won/lost stamps the close date."><Select name="stage" defaultValue={d?.stage ?? "prospect"} options={DEAL_STAGES.map((s) => ({ value: s, label: `${DEAL_STAGE_LABELS[s]} (${Math.round(DEAL_STAGE_PROBABILITY[s] * 100)}%)` }))} /></Field>
          <Field label="Owner"><Select name="ownerUserId" defaultValue={d?.ownerUserId ?? ""} options={userOptions(l.activeUsers)} /></Field>
          <Field label="Expected close"><input name="expectedCloseDate" type="date" defaultValue={d?.expectedCloseDate} className="input" /></Field>
        </div>
        <Field label="Next step"><input name="nextStep" defaultValue={d?.nextStep} className="input" placeholder="Send quote after Thursday call" /></Field>
        <Field label="Lost reason" hint="Only for closed lost."><input name="lostReason" defaultValue={d?.lostReason} className="input" /></Field>
        <SubmitButton>{d ? "Save deal" : "Create deal"}</SubmitButton>
      </div>
    </form>
  );
}
