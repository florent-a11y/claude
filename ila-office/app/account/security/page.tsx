import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { SECURITY_PATH, requireUser, sessionSetupRequired } from "@/lib/auth";
import { db } from "@/lib/db";
import { MIN_PASSWORD, getTwoFactorPolicy, hasTwoFactor, pendingTwoFactorSetup, twoFactorRequiredFor } from "@/lib/account-security";
import { groupSecret } from "@/lib/two-factor";
import { fmtDate } from "@/lib/dates";
import { Page, Card, Notice, Badge } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ConfirmSetupForm, NewCodesForm, RecoveryCodesGate } from "./SecurityForms";
import { cancelSetupAction, changePasswordAction, confirmSetupAction, disableAction, newCodesAction, startSetupAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account security" };

/**
 * Every user's own sign-in settings: the password, and two-step sign-in with an authenticator app
 * (lib/account-security.ts). A session held at the setup (the policy requires two-step sign-in) sees only this page.
 */
export default async function AccountSecurity({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; required?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const user = await db.get("users", session.id);
  if (!user) notFound();
  const [held, policy] = await Promise.all([sessionSetupRequired(), getTwoFactorPolicy()]);
  const required = twoFactorRequiredFor(policy, user.role);
  const on = hasTwoFactor(user);
  const setup = on ? null : pendingTwoFactorSetup(user);
  const qr = setup ? await QRCode.toString(setup.uri, { type: "svg", margin: 1, width: 196, errorCorrectionLevel: "M" }) : "";
  const left = user.twoFactor?.recoveryHashes.length ?? 0;
  return (
    <Page title="Account security" subtitle={<>{user.name} · {user.email}</>}>
      {sp.error ? <div className="mb-4"><Notice tone="red">{sp.error}</Notice></div> : sp.ok ? <div className="mb-4"><Notice tone="green">{sp.ok}</Notice></div> : null}
      {held && !on && <div className="mb-4"><Notice tone="amber">Your administrator requires two-step sign-in. Set it up below to continue: it takes two minutes and needs an authenticator app on your phone.</Notice></div>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={<>Two-step sign-in <Badge tone={on ? "green" : "slate"}>{on ? "on" : "off"}</Badge>{required && <> <Badge tone="blue">required</Badge></>}</>}>
          <RecoveryCodesGate confirmAction={confirmSetupAction} newCodesAction={newCodesAction} doneHref={held ? "/" : SECURITY_PATH}>
          {on ? (
            <div className="space-y-4 text-sm">
              <p>On since {fmtDate(user.twoFactor!.enabledAt.slice(0, 10))}. After your password, sign-in asks for the 6-digit code of your authenticator app.</p>
              <div>
                <p className="font-medium">Recovery codes: {left} left</p>
                <p className="mb-2 text-xs text-ink-500">Each signs you in once without your phone. Making new ones cancels the old ones.{left <= 2 && " You are running low: make new ones now."}</p>
                <NewCodesForm />
              </div>
              <details className="border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-xs text-red-700 underline">Turn two-step sign-in off, or move it to a new phone</summary>
                <ConfirmForm action={disableAction} message="Turn two-step sign-in off for your account?" className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block"><span className="label">Your password</span><input name="password" type="password" required autoComplete="current-password" className="input w-56" aria-label="Password, to turn two-step sign-in off" /></label>
                  <button type="submit" className="btn-danger">Turn off</button>
                </ConfirmForm>
                <p className="mt-2 text-xs text-ink-500">For a new phone: turn it off, then set it up again with the new phone.{required && " Your administrator requires it, so you will be asked to set it up again straight away."}</p>
              </details>
            </div>
          ) : setup ? (
            <div className="space-y-4 text-sm" data-testid="two-factor-setup">
              <ol className="list-decimal space-y-3 pl-5">
                <li>Install an authenticator app on your phone if you have none: Google Authenticator, Microsoft Authenticator, 1Password or Authy all work.</li>
                <li>
                  In the app, add an account and scan this code.
                  <div className="mt-2 inline-block rounded-lg border border-slate-200 bg-white p-2" aria-label="QR code for the authenticator app" dangerouslySetInnerHTML={{ __html: qr }} />
                  <p className="mt-1 text-xs text-ink-500">Cannot scan? Type this key into the app instead, as a time-based key: <span className="select-all font-mono text-ink-700" data-testid="two-factor-key">{groupSecret(setup.secret)}</span></p>
                  <p className="mt-1 text-xs text-ink-500">Reading this on the phone that has the app? <a href={setup.uri} className="text-brand-600 underline">Open it in the authenticator app</a>.</p>
                </li>
                <li>Type the 6-digit code the app now shows for ILA Office.</li>
              </ol>
              <ConfirmSetupForm />
              <form action={cancelSetupAction}><button className="text-xs text-ink-500 underline">Cancel this setup</button></form>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>With two-step sign-in, your password alone is not enough: sign-in also asks for a 6-digit code from an authenticator app on your phone. A stolen or guessed password then opens nothing.</p>
              <form action={startSetupAction}><SubmitButton pendingText="Preparing…">Set up two-step sign-in</SubmitButton></form>
              {!required && <p className="text-xs text-ink-500">Optional for your account. It can be turned off again here.</p>}
            </div>
          )}
          </RecoveryCodesGate>
        </Card>
        {!(held && !on) && (
          <Card title="Password">
            <form action={changePasswordAction} className="space-y-3">
              <label className="block"><span className="label">Current password</span><input name="current" type="password" required autoComplete="current-password" className="input" /></label>
              <label className="block"><span className="label">New password ({MIN_PASSWORD}+ characters)</span><input name="next" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" /></label>
              <label className="block"><span className="label">New password again</span><input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" /></label>
              <SubmitButton>Change password</SubmitButton>
              <p className="text-xs text-ink-500">{user.passwordChangedAt ? `Last changed ${fmtDate(user.passwordChangedAt.slice(0, 10))}. ` : ""}A long phrase is better than a short complicated word. Do not reuse a password from another site.</p>
            </form>
          </Card>
        )}
      </div>
    </Page>
  );
}
