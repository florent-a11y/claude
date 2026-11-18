import "server-only";
import type { PayMethod } from "../schema";
import { xenditConfigured } from "./xendit";
import { airwallexConfigured, cardAmount, cardCurrency } from "./airwallex";
import { demoMode } from "../config";

export interface MethodInfo {
  method: PayMethod;
  /** No provider keys, in development or on a test site: the payment is skipped and the order marked paid, to try the flow. */
  simulated: boolean;
}

/** Development, or a test site: missing payment providers are replaced by simulations. */
const dev = () => process.env.NODE_ENV !== "production" || demoMode();

export function bankDetails() {
  const number = (process.env.BANK_ACCOUNT_NUMBER ?? "").trim();
  if (number) return { bank: process.env.BANK_NAME ?? "", holder: process.env.BANK_ACCOUNT_NAME ?? "", number, sample: false };
  if (dev()) return { bank: "Sample Bank", holder: "PT Sample Company", number: "000 000 0000", sample: true };
  return null;
}

/**
 * Payment methods offered right now, in display order. A method without its keys is hidden on the live site;
 * in development and on a test site (DEMO_MODE=on) the two online methods are offered as simulations.
 */
export function availableMethods(): MethodInfo[] {
  const out: MethodInfo[] = [];
  if (xenditConfigured()) out.push({ method: "xendit", simulated: false });
  else if (dev()) out.push({ method: "xendit", simulated: true });
  if (airwallexConfigured()) out.push({ method: "airwallex", simulated: false });
  else if (dev()) out.push({ method: "airwallex", simulated: true });
  if (bankDetails()) out.push({ method: "transfer", simulated: false });
  if ((process.env.PAY_ON_DELIVERY ?? "on").toLowerCase() !== "off") out.push({ method: "cod", simulated: false });
  return out;
}

export function methodInfo(method: PayMethod): MethodInfo | undefined {
  return availableMethods().find((m) => m.method === method);
}

/** "USD 84.35" shown next to the card option, or null when no exchange rate is configured. */
export function cardQuote(totalIdr: number): string | null {
  const amount = cardAmount(totalIdr);
  return amount ? `${cardCurrency()} ${amount.toFixed(2)}` : null;
}

/** Rate shown next to the card option in the browser (null when cards are simulated or not configured). */
export function cardRate(): { currency: string; idrPerUnit: number } | null {
  const sample = cardAmount(1_000_000);
  return sample ? { currency: cardCurrency(), idrPerUnit: 1_000_000 / sample } : null;
}
