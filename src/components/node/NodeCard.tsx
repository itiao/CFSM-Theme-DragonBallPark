import { ArrowDown, ArrowUp } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/GlassPanel";
import type { Node } from "@/services/cfsm/types";
import type { TodayTraffic } from "@/services/todayTraffic";
import { cn } from "@/lib/cn";
import {
  daysUntil,
  formatBytes,
  formatDuration,
  formatPercent,
  formatSpeed,
  formatTrafficGb,
  formatBillingCycle,
  formatPrice,
} from "@/utils/format";

/** ↓/↑ 双向数值。 */
function DualValue({
  down,
  up,
  className,
}: {
  down: string;
  up: string;
  className?: string;
}) {
  return (
    <span className={cn("tnum inline-flex items-center gap-2 whitespace-nowrap", className)}>
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

function OnlineBadge({ node }: { node: Node }) {
  const online = node.metrics.online;
  const text = online
    ? `在线 ${node.metrics.uptime > 0 ? formatDuration(node.metrics.uptime) : ""}`.trim()
    : node.cpuCores > 0 || node.memTotal > 0
      ? "离线"
      : "未接入";
  return (
    <Badge dot={online ? "ok" : "off"} tone={online ? "default" : "muted"} className="tnum">
      {text}
    </Badge>
  );
}

function ExpiryBadge({ node }: { node: Node }) {
  const days = daysUntil(node.expireDate);
  if (days === null) {
    return (
      <span className="text-xs text-muted-foreground" title="永不到期">
        ∞
      </span>
    );
  }
  return (
    <span
      className={cn(
        "tnum text-xs whitespace-nowrap",
        days < 0 ? "text-danger" : days <= 7 ? "text-warn" : "text-muted-foreground",
      )}
    >
      {days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`}
    </span>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum truncate">{value}</span>
    </div>
  );
}

export const NodeCard = memo(function NodeCard({
  node,
  today,
  showPrice,
}: {
  node: Node;
  today: TodayTraffic;
  showPrice: boolean;
}) {
  const { metrics } = node;
  const trafficUsed =
    node.trafficCalcType === "up"
      ? metrics.trafficUpMonth
      : node.trafficCalcType === "down"
        ? metrics.trafficDownMonth
        : metrics.trafficUpMonth + metrics.trafficDownMonth;
  const trafficPct = node.trafficLimit > 0 ? (trafficUsed / node.trafficLimit) * 100 : 0;

  return (
    <Link
      to={`/server/${encodeURIComponent(node.id)}`}
      className="block rounded-xl border border-hairline bg-card-subtle p-3 transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{node.name}</span>
          {node.region ? (
            <Badge tone="muted" className="font-mono">
              {node.region}
            </Badge>
          ) : null}
          <OnlineBadge node={node} />
        </div>
        <ExpiryBadge node={node} />
      </div>

      <div className="mt-1 truncate text-xs text-muted-foreground">
        {[node.os, node.kernel].filter(Boolean).join(" · ") || "等待首次上报"}
      </div>

      <div className="mt-2.5 space-y-2">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              CPU <span className="tnum text-foreground">{formatPercent(metrics.cpuPct)}</span>
            </span>
            <span className="tnum">
              内存 {formatBytes(metrics.ramUsed)} / {formatBytes(metrics.ramTotal)}
            </span>
            <span className="tnum text-muted-foreground">{formatPercent(metrics.ramPct, 0)}</span>
          </div>
          <ProgressBar value={metrics.ramPct} className="mt-1" />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="tnum">
              磁盘 {formatBytes(metrics.diskUsed)} / {formatBytes(metrics.diskTotal)}
            </span>
            <span className="tnum text-muted-foreground">{formatPercent(metrics.diskPct, 0)}</span>
          </div>
          <ProgressBar value={metrics.diskPct} className="mt-1" />
        </div>

        <MetricRow
          label="负载"
          value={`${metrics.load1.toFixed(2)} / ${metrics.load5.toFixed(2)} / ${metrics.load15.toFixed(2)}`}
        />

        {node.trafficLimit > 0 ? (
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="tnum">
                流量 {formatTrafficGb(trafficUsed)} / {formatTrafficGb(node.trafficLimit)}
              </span>
              <span className="tnum text-muted-foreground">{formatPercent(trafficPct, 0)}</span>
            </div>
            <ProgressBar value={trafficPct} className="mt-1" />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">实时网速</span>
          <DualValue down={formatSpeed(metrics.netDown)} up={formatSpeed(metrics.netUp)} />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground" title="由前后两次速率按时间积分估算，只统计页面开着的时段">
            今日流量*
          </span>
          <DualValue down={formatBytes(today.rx)} up={formatBytes(today.tx)} />
        </div>

        {showPrice && node.price > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2 text-xs text-muted-foreground">
            <span>{formatBillingCycle(node.billingCycle)}</span>
            <span className="tnum">{formatPrice(node.price, node.currency)}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
});
