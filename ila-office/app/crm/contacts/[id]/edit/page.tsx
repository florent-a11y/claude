import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/util";
import { Page } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { lookups, sortedCompanies } from "../../../_lib/server";
import { ContactForm } from "../../ContactForm";
import { deleteContact, updateContact } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditContact({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("crm:write");
  const { id } = await params;
  const [contact, l] = await Promise.all([db.get("contacts", id), lookups()]);
  if (!contact) notFound();
  const name = fullName(contact);
  return (
    <Page title={`Edit ${name}`} breadcrumbs={[{ href: "/crm/contacts", label: "Contacts" }, { href: `/crm/contacts/${id}`, label: name }, { label: "Edit" }]}
      actions={<ConfirmForm action={deleteContact.bind(null, id)} message={`Delete ${name}? Only possible when no deals, quotes or projects reference this contact.`}><button className="btn-danger">Delete</button></ConfirmForm>}>
      <ContactForm contact={contact} companies={sortedCompanies(l)} users={l.activeUsers} action={updateContact.bind(null, id)} />
    </Page>
  );
}
