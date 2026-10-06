import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { PasswordForm, ProfileForm } from "./SettingsForms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description={`Signed in as ${user.email} · ${roleLabel(user.role)}`} />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5"><SectionTitle>Profile</SectionTitle><ProfileForm user={user} /></section>
        <section className="card p-5"><SectionTitle>Password</SectionTitle><PasswordForm /></section>
      </div>
    </div>
  );
}
