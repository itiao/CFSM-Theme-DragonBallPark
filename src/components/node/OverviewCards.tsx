import { ArrowDown, ArrowUp, Gauge, HardDrive, Server, Zap } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { Sparkline } from "@/components/ui/Sparkline";
import type { Node, OverviewStats } from "@/services/cfsm/types";
import type { TodayTraffic } from "@/services/todayTraffic";
import { cn } from "@/lib/cn";
import { formatBytes, formatPercent, formatSpeed } from "@/utils/format";

/** 迷你走势图的采样缓冲长度。 */
const SPARK_POINTS = 32;

function StatCard({
  icon,
  label,
  children,
  className,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-hairline bg-card-subtle p-3", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="[&>svg]:size-3.5">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function DualValue({ down, up }: { down: string; up: string }) {
  return (
    <span className="tnum inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        <ArrowDown className="size-3 text-chart-2" aria-hidden />
        {down}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <ArrowUp className="size-3 text-chart-1" aria-hidden />
        {up}
      </span>
    </span>
  );
}

export function OverviewCards({
  nodes,
  stats,
  today,
  spark,
}: {
  nodes: Node[];
  stats: OverviewStats;
  today: Record<string, TodayTraffic>;
  spark: { rx: number[]; tx: number[] };
}) {
  const busiest = useMemo(() => {
    let peak: Node | null = null;
    for (const node of nodes) {
      if (!node.metrics.online) continue;
      if (!peak || node.metrics.cpuPct > peak.metrics.cpuPct) peak = node;
    }
    return peak;
  }, [nodes]);

  const todayTotals = useMemo(() => {
    let rx = 0;
    let tx = 0;
    for (const node of nodes) {
      const value = today[node.id];
      if (!value) continue;
      rx += value.rx;
      tx += value.tx;
    }
    return { rx, tx };
  }, [nodes, today]);

  const lifetime = useMemo(() => {
    let rx = 0;
    let tx = 0;
    for (const node of nodes) {
      rx += node.metrics.trafficDownTotal;
      tx += node.metrics.trafficUpTotal;
    }
    return { rx, tx };
  }, [nodes]);

  const busyPct = busiest?.metrics.cpuPct ?? 0;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatCard icon={<Server />} label="节点">
        <div className="tnum mt-1 text-lg font-semibold">
          {stats.online} / {stats.total}
        </div>
        <div className="mt-auto pt-1 text-xs text-muted-foreground">
          {stats.offline > 0 ? `${stats.offline} 个离线` : "全部在线"}
        </div>
      </StatCard>

      <StatCard icon={<Gauge />} label="最忙节点">
        <div className="tnum mt-1 text-lg font-semibold">
          {busiest ? formatPercent(busyPct) : "—"}
        </div>
        <div
          className={cn(
            "mt-auto truncate pt-1 text-xs",
            busyPct >= 85 ? "font-medium text-warn" : "text-muted-foreground",
          )}
        >
          {busiest ? busiest.name : "无在线节点"}
        </div>
      </StatCard>

      <StatCard icon={<HardDrive />} label="今日流量 *">
        <DualValue down={formatBytes(todayTotals.rx)} up={formatBytes(todayTotals.tx)} />
        <div className="mt-2 text-xs text-muted-foreground">累计流量</div>
        <DualValue down={formatBytes(lifetime.rx)} up={formatBytes(lifetime.tx)} />
      </StatCard>

      <StatCard icon={<Zap />} label="实时网速">
        <DualValue down={formatSpeed(stats.globalSpeedIn)} up={formatSpeed(stats.globalSpeedOut)} />
        <div className="mt-auto pt-1">
          <Sparkline
            series={[
              { values: spark.rx, className: "text-chart-2" },
              { values: spark.tx, className: "text-chart-1" },
            ]}
          />
        </div>
      </StatCard>
    </div>
  );
}

export { SPARK_POINTS };
