import path from "node:path";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Hub";
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "Your company";
export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const SESSION_COOKIE = "hub_session";
export const SESSION_DAYS = 30;
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
