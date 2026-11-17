import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

/**
 * Everything except the API, Next internals, files with an extension (icon.svg, sitemap.xml, llms.txt…) and the
 * link preview images, which must answer directly at /id/opengraph-image without a redirect.
 */
export const config = { matcher: ["/((?!api|_next|.*\\..*|.*/opengraph-image).*)"] };
