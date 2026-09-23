import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware navigation. Use these for every internal link on the public site;
 *  links to /admin and /api must use a plain <a> or next/link instead. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
