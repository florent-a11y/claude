import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware navigation for every internal link on the public site. Links to /admin and /api use a plain <a>. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
