import { getRequestConfig } from "next-intl/server";
import { hasLocale, IntlErrorCode } from "next-intl";
import { routing, type AppLocale } from "./routing";
import { loadMessages, messageFallback } from "./messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: await loadMessages(locale),
    onError(error) {
      // A missing key is served from the English catalog (see getMessageFallback); never throw.
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        if (process.env.NODE_ENV !== "production") console.warn("[i18n]", error.message);
        return;
      }
      console.error("[i18n]", error.message);
    },
    getMessageFallback: messageFallback,
  };
});
