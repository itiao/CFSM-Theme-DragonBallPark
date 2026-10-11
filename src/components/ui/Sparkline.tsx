import { useMemo } from "react";

import { cn } from "@/lib/cn";

export interface SparkSeries {
  values: number[];
  className: string;
}

/**
 * 极简走势图（原生 SVG polyline）。
 * 目标站的「实时网速」小图就是两条 polyline 叠在一起。
 */
export function Sparkline({
  series,
  height = 23,
  width = 100,
  className,
}: {
  series: SparkSeries[];
  height?: number;
  width?: number;
  className?: string;
}) {
  const max = useMemo(() => {
    let peak = 0;
    for (const item of series) {
      for (const value of item.values) {
        if (Number.isFinite(value) && value > peak) peak = value;
      }
    }
    return peak;
  }, [series]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-6 w-full overflow-visible", className)}
      aria-hidden="true"
    >
      {series.map((item, index) => {
        const count = item.values.length;
        if (count < 2) return null;
        const points = item.values
          .map((value, i) => {
            const x = (i / (count - 1)) * width;
            const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
            const y = height - ratio * (height - 2) - 1;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(" ");
        return (
          <polyline
            key={index}
            className={item.className}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
            points={points}
          />
        );
      })}
    </svg>
  );
}
