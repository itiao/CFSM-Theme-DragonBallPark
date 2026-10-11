import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeTone = "default" | "ok" | "warn" | "danger" | "muted";

const TONE_CLASS: Record<BadgeTone, string> = {
  default: "text-foreground",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-muted-foreground",
};

export function Badge({
  children,
  tone = "default",
  dot,
  className,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: "ok" | "off";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline px-1.5 py-0.5 text-xs font-normal",
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn("size-1.5 rounded-full", dot === "ok" ? "bg-ok" : "bg-muted-foreground/40")}
        />
      ) : null}
      {children}
    </span>
  );
}
