import { ConfirmForm, SubmitButton } from "@/components/client";
import { createBooksForCompanies } from "./actions";

/** Admins: the one-click "create books" for every active client company without books (Client companies and Books lists). */
export function CreateBooksButton({ count }: { count: number }) {
  const companies = `${count} compan${count === 1 ? "y" : "ies"}`;
  return (
    <ConfirmForm action={createBooksForCompanies} message={`Create books for ${count} active compan${count === 1 ? "y" : "ies"} without books? Each gets an entity with the standard chart of accounts and a default tax profile (normal CIT, not PKP, LKPM for PT PMA) that you can refine in Settings → Entities. A company whose books already exist under the same name or NPWP is linked to them instead. Prospects are skipped.`}>
      <SubmitButton className="btn-secondary" pendingText="Creating books…">Create books for {companies} without books</SubmitButton>
    </ConfirmForm>
  );
}
