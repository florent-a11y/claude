import "server-only";
import { headers } from "next/headers";

export type Role = "ops" | "doctor";
export interface Staff { role: Role; user: string }

/**
 * Who is signed in to the console. The middleware authenticates every /admin and /api/admin request and writes
 * these headers itself (anything the browser sent under the same names is removed first).
 */
export async function staff(): Promise<Staff> {
  const h = await headers();
  const role = h.get("x-clinic-role");
  if (role !== "ops" && role !== "doctor") throw new Error("Not signed in to the console");
  return { role, user: h.get("x-clinic-user") ?? role };
}

/** Health questionnaires and prescribing decisions are for the doctor sign-in only. */
export function canReview(s: Staff) {
  return s.role === "doctor";
}
