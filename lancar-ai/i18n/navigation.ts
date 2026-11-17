import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware navigation: use these for every internal link so /layanan and /en/services stay in step. */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } = createNavigation(routing);
