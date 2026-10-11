import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "outline" | "ghost" | "secondary";
type ButtonSize = "sm" | "xs" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "bg-foreground/90 text-background hover:bg-foreground",
  outline: "border border-hairline bg-card-subtle hover:bg-accent",
  ghost: "hover:bg-accent",
  secondary: "bg-accent text-accent-foreground hover:bg-accent/80",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  xs: "h-6 px-2 text-xs",
  icon: "size-8",
};

export function Button({
  children,
  variant = "outline",
  size = "sm",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
