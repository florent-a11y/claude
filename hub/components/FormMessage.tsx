import type { ActionState } from "@/lib/actions/state";

export function FormMessage({ state, success }: { state: ActionState; success?: string }) {
  if (state.error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.ok && success) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>;
  return null;
}
