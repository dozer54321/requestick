import { cn } from "@/lib/utils";
import { useBranding } from "./brand-context";

export function MeshMark({ className }: { className?: string }) {
  const brand = useBranding();
  if (brand.logoData) {
    return (
      <img
        src={brand.logoData}
        alt=""
        className={cn("size-8 rounded-md object-contain", className)}
      />
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 text-ink", className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path d="M8 8h16v16H8z" fill="none" stroke="var(--color-primary-fg)" strokeWidth="1.7" />
      <path
        d="M8 13.33h16M8 18.67h16M13.33 8v16M18.67 8v16"
        stroke="var(--color-primary-fg)"
        strokeWidth="1.1"
      />
    </svg>
  );
}

export function MeshWordmark({ compact = false }: { compact?: boolean }) {
  const brand = useBranding();
  return (
    <span className="flex items-center gap-2.5">
      <MeshMark className="size-8" />
      <span className="flex flex-col leading-none">
        <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
          {brand.companyName || "Requestick"}
        </span>
        {!compact ? (
          <span className="mt-0.5 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
            {brand.tagline || "Request Ticket Tracker"}
          </span>
        ) : null}
      </span>
    </span>
  );
}
