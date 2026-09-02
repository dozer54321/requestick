import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "hot" | "today" | "later" | "open" | "claimed" | "filled" | "cancelled" | "neutral";
};

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
  hot: "bg-hot-bg text-hot",
  today: "bg-today-bg text-today",
  later: "bg-later-bg text-later",
  open: "bg-bg-deep text-ink-soft",
  claimed: "bg-claimed-bg text-claimed",
  filled: "bg-later-bg text-filled",
  cancelled: "bg-bg-deep text-faint line-through",
  neutral: "bg-bg-deep text-muted",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm px-1.5 font-mono text-[11px] font-medium uppercase tracking-wider",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
