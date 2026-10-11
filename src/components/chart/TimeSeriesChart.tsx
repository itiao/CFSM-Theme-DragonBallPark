import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { getSettings, subscribeSettings } from "@/services/settings";

export interface ChartSeries {
  label: string;
  /** CSS 颜色（支持 var(...)）。 */
  color: string;
  values: Array<number | null>;
  /** 是否用面积填充。 */
  fill?: boolean;
  /** 是否画成阶梯（丢包这类离散值）。 */
  stepped?: boolean;
}

function readVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * 把 `var(--chart-1)` 解析成实际颜色。
 *
 * SVG 的 stroke / fill 是**表现属性**，里面写 `var()` 不生效（CSS 变量只在 CSS 属性里解析），
 * 所以必须在建图之前解析成具体色值。
 */
function resolveColor(value: string): string {
  const match = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/.exec(value.trim());
  if (!match) return value;
  return readVar(match[1]!, "#10b981");
}

/** 给颜色加透明度，用于面积填充。 */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = Number.parseInt(hex[1]!, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const parts = rgb[1]!.split(",").map((item) => item.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return color;
}

/**
 * uPlot 的 React 封装。
 *
 * 只在数据或尺寸变化时重建实例（图表数量少、重建成本可接受），
 * 省掉一整套增量更新的坑。
 */
export function TimeSeriesChart({
  times,
  series,
  height = 180,
  yFormatter,
  yRange,
}: {
  /** X 轴（秒或毫秒，跟 series 对齐）。 */
  times: number[];
  series: ChartSeries[];
  height?: number;
  yFormatter?: (value: number) => string;
  yRange?: [number, number];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  // 明暗切换时要重建图表（配色令牌变了）。
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const themeKey = settings.appearance;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const axisColor = readVar("--muted-foreground", "#888");
    const gridColor = readVar("--hairline", "rgba(128,128,128,.2)");

    const data: uPlot.AlignedData = [
      times,
      ...series.map((item) => item.values as (number | null)[]),
    ];

    const options: uPlot.Options = {
      width: host.clientWidth || 600,
      height,
      padding: [12, 12, 0, 0],
      cursor: { drag: { x: true, y: false } },
      legend: { show: series.length > 1 },
      scales: {
        x: { time: false },
        y: yRange ? { range: yRange } : { range: (_u, _min, max) => [0, max > 0 ? max * 1.1 : 1] },
      },
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor },
          font: "11px ui-sans-serif, system-ui",
          values: (_u, ticks) =>
            ticks.map((value) =>
              new Date(value).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            ),
        },
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor },
          font: "11px ui-sans-serif, system-ui",
          size: 56,
          values: (_u, ticks) =>
            ticks.map((value) => (yFormatter ? yFormatter(value) : String(Math.round(value)))),
        },
      ],
      series: [
        { label: "时间" },
        ...series.map((item) => ({
          label: item.label,
          stroke: resolveColor(item.color),
          fill: item.fill ? withAlpha(resolveColor(item.color), 0.18) : undefined,
          width: 1.5,
          points: { show: false },
          spanGaps: false,
          value: (_u: uPlot, value: number | null) =>
            value == null ? "—" : yFormatter ? yFormatter(value) : value.toFixed(1),
        })),
      ],
    };

    // stepped 系列（丢包）用路径构建器实现阶梯。
    series.forEach((item, index) => {
      if (!item.stepped) return;
      const target = options.series[index + 1];
      if (target) {
        target.paths = uPlot.paths.stepped!({ align: 1 });
      }
    });

    const chart = new uPlot(options, data, host);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      if (!host.clientWidth) return;
      chart.setSize({ width: host.clientWidth, height });
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, [times, series, height, yFormatter, yRange, themeKey]);

  return <div ref={hostRef} className="w-full" />;
}
