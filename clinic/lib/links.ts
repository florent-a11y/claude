import { site } from "./config";
import { localizedPath } from "@/i18n/routing";

/** The customer's private order page: "/ru/order/VN-7K2M4Q?t=…". */
export function orderPath(order: { id: string; token: string; contact: { locale: string } }, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ t: order.token, ...extra });
  return `${localizedPath(order.contact.locale, `/order/${order.id}`)}?${q.toString()}`;
}
export function orderUrl(order: Parameters<typeof orderPath>[0], extra: Record<string, string> = {}) {
  return `${site.url}${orderPath(order, extra)}`;
}
