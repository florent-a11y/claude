import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/util";
import { ENTITY_TYPE_SHORT } from "@/lib/types";
import { Page, Card, DL, Badge, statusTone } from "@/components/ui";
import { activitiesFor, lookups } from "../../_lib/server";
import { Timeline } from "../../_components/Timeline";
import { LANGUAGE_LABELS } from "../ContactForm";

export const dynamic = "force-dynamic";

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const contact = await db.get("contacts", id);
  if (!contact) notFound();
  const [l, activities] = await Promise.all([lookups(), activitiesFor((a) => a.contactId === id)]);
  const name = fullName(contact) || "(no name)";
  const companies = contact.companyIds.map((cid) => l.companies.get(cid)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const write = can(me, "crm:write");
  const path = `/clients/contacts/${id}`;
  return (
    <Page title={name} subtitle={<span>{contact.nationality ? `${contact.nationality} · ` : ""}{contact.email ?? ""}{contact.phone ? ` · ${contact.phone}` : ""}</span>}
      breadcrumbs={[{ href: "/clients/contacts", label: "Contacts" }, { label: name }]}
      actions={<>
        {write && <Link href={`/clients/contacts/${id}/edit`} className="btn-primary">Edit</Link>}
      </>}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="Details">
            <DL items={[
              ["Email", contact.email ? <a className="text-brand-600 underline" href={`mailto:${contact.email}`}>{contact.email}</a> : "—"],
              ["Phone", contact.phone ?? "—"],
              ["WhatsApp", contact.whatsapp ? <a className="text-brand-600 underline" href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{contact.whatsapp}</a> : "—"],
              ["Nationality", contact.nationality ?? "—"], ["Language", contact.language ? LANGUAGE_LABELS[contact.language] ?? contact.language : "—"],
              ["Date of birth", fmtDate(contact.dateOfBirth)],
              ["Passport", contact.passportNumber ? `${contact.passportNumber} · exp. ${fmtDate(contact.passportExpiry)}` : "—"],
              ["Source", contact.source ?? "—"], ["Owner", l.user(contact.ownerUserId)],
              ["Tags", contact.tags.length ? <span className="space-x-1">{contact.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : "—"],
              ["Drive", contact.driveFolderUrl ? <a className="text-brand-600 underline" href={contact.driveFolderUrl} target="_blank" rel="noreferrer">Open folder</a> : "—"],
              ["HubSpot / QBO", [contact.hubspotId, contact.qboCustomerId].filter(Boolean).join(" / ") || "—"],
              ["Created", fmtDate(contact.createdAt.slice(0, 10))],
            ]} />
            {contact.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm">{contact.notes}</p>}
          </Card>
          <Card title="Companies" actions={write && <Link href={`/clients/companies/new?contactId=${id}`} className="text-xs text-brand-600 underline">New company</Link>}>
            {companies.length === 0 ? <p className="text-sm text-ink-500">Not linked to a company.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {companies.map((co) => (
                  <li key={co.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <Link href={`/clients/companies/${co.id}`} className="cell font-medium hover:underline">{co.name}</Link>
                      <span className="cell-sub">{ENTITY_TYPE_SHORT[co.type]}{co.region ? ` · ${co.region}` : ""}{co.primaryContactId === id ? " · primary contact" : ""}</span>
                    </span>
                    <Badge tone={statusTone(co.status)}>{co.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Timeline activities={activities} refs={{ contactId: id, companyId: contact.companyIds[0] }} backPath={path} canWrite={write} />
        </div>
      </div>
    </Page>
  );
}
