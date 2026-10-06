export interface ActionState {
  error?: string;
  ok?: boolean;
}
export const idle: ActionState = {};

export function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function opt(fd: FormData, key: string, max = 2000): string | null {
  const v = str(fd, key, max);
  return v ? v : null;
}
export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "1" || v === "true";
}
export function isDate(v: string | null): boolean {
  return !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
}
