import { initials } from "@/lib/format";

const SIZES = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" } as const;

export function Avatar({ name, color, size = "sm", className = "" }: { name: string; color?: string | null; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${className}`}
      style={{ backgroundColor: color || "#64748b" }}
      title={name}
      aria-label={name}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { name: string; color?: string | null }[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} color={p.color} size="xs" className="ring-2 ring-white" />
      ))}
      {rest > 0 && (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 ring-2 ring-white">
          +{rest}
        </span>
      )}
    </span>
  );
}
