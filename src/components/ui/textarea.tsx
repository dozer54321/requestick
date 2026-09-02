import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-md bg-surface-2 px-3 py-2.5 text-sm text-ink shadow-[0_0_0_1px_var(--color-line)]",
      "placeholder:text-faint",
      "transition-[box-shadow] duration-150",
      "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-ink)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
