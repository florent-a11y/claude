import { MessageCircle, PhoneCall } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { whatsappLink } from "@/lib/config";
import type { Dictionary } from "@/content";

/**
 * The main action everywhere on the site: open WhatsApp with a prefilled message. Until a WhatsApp number is
 * configured (NEXT_PUBLIC_WHATSAPP_NUMBER) it links to the contact form instead, so no button is ever dead.
 */
export function BookCallButton({
  dict,
  className = "btn btn-primary",
  label,
  message,
}: {
  dict: Dictionary;
  className?: string;
  label?: string;
  message?: string;
}) {
  const href = whatsappLink(message ?? dict.common.whatsappGreeting);
  const text = label ?? dict.common.bookCall;
  if (!href) {
    return (
      <Link href="/contact" className={className}>
        <PhoneCall size={18} aria-hidden="true" />
        {text}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <MessageCircle size={18} aria-hidden="true" />
      {text}
    </a>
  );
}
