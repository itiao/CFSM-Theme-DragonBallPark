import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** 玻璃拟态面板。 */
export function GlassPanel({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "aside" | "header";
}) {
  return <Tag className={cn("glass rounded-xl shadow-sm", className)}>{children}</Tag>;
}

/** 细进度条，颜色按占用率分级。 */
export function ProgressBar({
  value,
  tone = "auto",
  className,
}: {
  value: number;
  tone?: "auto" | "accent" | "warn" | "danger";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const resolved =
    tone === "auto" ? (pct >= 90 ? "danger" : pct >= 75 ? "warn" : "accent") : tone;
  const fill =
    resolved === "danger" ? "bg-danger" : resolved === "warn" ? "bg-warn" : "bg-chart-1";

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
