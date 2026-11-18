import { waLink } from "@/lib/config";

export function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.600 15.100L2 22l5-1.300A10 10 0 1 0 12 2Zm0 18.200a8.200 8.200 0 0 1-4.200-1.150l-.300-.180-3 .800.800-2.900-.200-.300A8.200 8.200 0 1 1 12 20.200Zm4.500-6.100c-.250-.120-1.450-.720-1.680-.800-.220-.080-.390-.120-.550.120-.160.250-.630.800-.780.960-.140.160-.290.180-.530.060-.250-.120-1.040-.380-1.980-1.220-.730-.650-1.230-1.460-1.370-1.700-.140-.250-.020-.380.110-.500.110-.110.250-.290.370-.430.120-.140.160-.250.250-.410.080-.160.040-.310-.020-.430-.060-.120-.550-1.330-.760-1.820-.200-.480-.400-.410-.550-.420h-.470c-.160 0-.430.060-.650.310-.220.250-.860.840-.860 2.050 0 1.200.880 2.370 1 2.530.120.160 1.730 2.640 4.190 3.700.590.250 1.040.400 1.400.520.590.190 1.120.160 1.540.100.470-.070 1.450-.590 1.650-1.160.200-.570.200-1.060.140-1.160-.060-.100-.220-.160-.470-.290Z" />
    </svg>
  );
}

/** WhatsApp button with a prefilled message. Renders `fallback` (or nothing) when no number is configured. */
export function WhatsAppLink({ text, label, className = "btn-secondary", fallback = null }: { text?: string; label: string; className?: string; fallback?: React.ReactNode }) {
  const href = waLink(text);
  if (!href) return <>{fallback}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <WhatsAppIcon />
      {label}
    </a>
  );
}
