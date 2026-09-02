import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-ink shadow-[0_0_0_1px_var(--color-line)]",
        "placeholder:text-faint",
        "transition-[box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-ink)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
