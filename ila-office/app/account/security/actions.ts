"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SECURITY_PATH, requireUser, setSessionCookie } from "@/lib/auth";
import {
  SecurityError, cancelTwoFactorSetup, changeOwnPassword, confirmTwoFactorSetup, disableTwoFactor, getTwoFactorPolicy, regenerateRecoveryCodes, startTwoFactorSetup, twoFactorRequiredFor,
} from "@/lib/account-security";

/** What the forms that reveal recovery codes get back: the codes, once, or why not. */
export interface CodesState { codes?: string[]; error?: string }

const text = (fd: FormData, key: string) => { const v = fd.get(key); return typeof v === "string" ? v : ""; };
const message = (e: unknown) => (e instanceof SecurityError ? e.message : "Something went wrong. Try again.");
const flash = (kind: "ok" | "error", msg: string) => `${SECURITY_PATH}?${kind}=${encodeURIComponent(msg)}`;

export async function changePasswordAction(fd: FormData) {
  const user = await requireUser();
  let to: string;
  try {
    if (text(fd, "next") !== text(fd, "confirm")) throw new SecurityError("The two new passwords are not the same.");
    await changeOwnPassword(user.id, text(fd, "current"), text(fd, "next"));
    to = flash("ok", "Password changed");
  } catch (e) {
    to = flash("error", message(e));
  }
  redirect(to);
}

export async function startSetupAction() {
  const user = await requireUser();
  let to = SECURITY_PATH;
  try { await startTwoFactorSetup(user.id); } catch (e) { to = flash("error", message(e)); }
  revalidatePath(SECURITY_PATH);
  redirect(to);
}

export async function cancelSetupAction() {
  const user = await requireUser();
  await cancelTwoFactorSetup(user.id);
  revalidatePath(SECURITY_PATH);
  redirect(SECURITY_PATH);
}

/** Confirms the setup with a first code. The session is issued again: one held at the setup is now a full session. */
export async function confirmSetupAction(_prev: CodesState, fd: FormData): Promise<CodesState> {
  const user = await requireUser();
  try {
    const { recoveryCodes } = await confirmTwoFactorSetup(user.id, text(fd, "code"));
    await setSessionCookie(user.id);
    return { codes: recoveryCodes };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function newCodesAction(_prev: CodesState, fd: FormData): Promise<CodesState> {
  const user = await requireUser();
  try {
    return { codes: (await regenerateRecoveryCodes(user.id, text(fd, "password"))).recoveryCodes };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Turns the second step off. Where the policy requires it, the session goes back to "set it up first". */
export async function disableAction(fd: FormData) {
  const user = await requireUser();
  let to: string;
  try {
    await disableTwoFactor(user.id, text(fd, "password"));
    const required = twoFactorRequiredFor(await getTwoFactorPolicy(), user.role);
    if (required) await setSessionCookie(user.id, { setupRequired: true });
    to = required ? `${SECURITY_PATH}?required=1` : flash("ok", "Two-step sign-in is off");
  } catch (e) {
    to = flash("error", message(e));
  }
  revalidatePath(SECURITY_PATH);
  redirect(to);
}
