import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";
import { TimeSeriesChart, type ChartSeries } from "@/components/chart/TimeSeriesChart";
import { Badge } from "@/components/ui/Badge";
import { GlassPanel, ProgressBar } from "@/components/ui/GlassPanel";
import { useAppData } from "@/app/AppData";
import { DEFAULT_HISTORY_HOURS, getHistory, type HistoryHours } from "@/services/cfsm/api";
import { CARRIER_KEYS } from "@/services/cfsm/types";
import { carrierHealth } from "@/services/healthScore";
import { cn } from "@/lib/cn";
import {
  daysUntil,
  formatBillingCycle,
  formatBytes,
  formatDuration,
  formatLatency,
  formatLoss,
  formatPercent,
  formatPrice,
  formatSpeed,
} from "@/utils/format";

const RANGES: Array<{ hours: HistoryHours; label: string }> = [
  { hours: 0.167, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
];

type Tab = "resource" | "latency";

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm">{children}</div>
    </div>
  );
}

function ChartBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassPanel className="p-3">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle ? <span className="tnum text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
      {children}
    </GlassPanel>
  );
}

export function NodeDetail() {
  const { id = "" } = useParams();
  const { nodes, setSubscribeIds } = useAppData();
  const [tab, setTab] = useState<Tab>("resource");
  const [hours, setHours] = useState<HistoryHours>(DEFAULT_HISTORY_HOURS);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getHistory>>>({
    load: [],
    ping: [],
  });
  const [loading, setLoading] = useState(true);

  const node = useMemo(() => nodes.find((item) => item.id === id) ?? null, [nodes, id]);

  // 详情页只订阅这一台，不重连（同一条连接上改订阅）。
  useEffect(() => {
    if (id) setSubscribeIds([id]);
    return () => setSubscribeIds(null);
  }, [id, setSubscribeIds]);

  // 历史只在进页面与切换档位时各查一次。
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getHistory(id, hours)
      .then((value) => {
        if (!cancelled) setHistory(value);
      })
      .catch(() => {
        if (!cancelled) setHistory({ load: [], ping: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, hours]);

  const loadTimes = useMemo(() => history.load.map((row) => row.time), [history.load]);
  const pingTimes = useMemo(() => history.ping.map((row) => row.time), [history.ping]);

  const resourceSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: "CPU %",
        color: "var(--chart-1)",
        values: history.load.map((row) => row.cpu),
        fill: true,
      },
    ],
    [history.load],
  );

  const memSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: "内存",
        color: "var(--chart-2)",
        values: history.load.map((row) => (row.ramTotal > 0 ? (row.ram / row.ramTotal) * 100 : null)),
        fill: true,
      },
    ],
    [history.load],
  );

  const netSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: "下行",
        color: "var(--chart-2)",
        values: history.load.map((row) => row.netIn),
      },
      {
        label: "上行",
        color: "var(--chart-1)",
        values: history.load.map((row) => row.netOut),
      },
    ],
    [history.load],
  );

  const diskSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: "磁盘",
        color: "var(--chart-5)",
        values: history.load.map((row) => (row.diskTotal > 0 ? (row.disk / row.diskTotal) * 100 : null)),
        fill: true,
      },
    ],
    [history.load],
  );

  const pingSeries = useMemo<ChartSeries[]>(
    () =>
      CARRIER_KEYS.map((key, index) => ({
        label: key.toUpperCase(),
        color: `var(--chart-${index + 1})`,
        values: history.ping.map((row) => row[key]),
      })),
    [history.ping],
  );

  const lossSeries = useMemo<ChartSeries[]>(
    () =>
      CARRIER_KEYS.map((key, index) => ({
        label: `${key.toUpperCase()} 丢包`,
        color: `var(--chart-${index + 1})`,
        values: history.ping.map((row) =>
          row[`loss${key[0].toUpperCase()}${key.slice(1)}` as keyof typeof row] as number | null,
        ),
        stepped: true,
      })),
    [history.ping],
  );

  if (!node) {
    return (
      <AppShell>
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="text-lg font-semibold">节点不存在或未公开</p>
            <p className="mt-1 text-sm text-muted-foreground">
              列表还在加载，或者这台节点已经被移除。
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const { metrics } = node;
  const days = daysUntil(node.expireDate);
  const health = carrierHealth(node);
  const trafficUsed =
    node.trafficCalcType === "up"
      ? metrics.trafficUpMonth
      : node.trafficCalcType === "down"
        ? metrics.trafficDownMonth
        : metrics.trafficUpMonth + metrics.trafficDownMonth;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-3 p-3">
        <GlassPanel className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold">{node.name}</h1>
            {node.region ? (
              <Badge tone="muted" className="font-mono">
                {node.region}
              </Badge>
            ) : null}
            <Badge dot={metrics.online ? "ok" : "off"} tone={metrics.online ? "default" : "muted"}>
              {metrics.online ? `在线 ${formatDuration(metrics.uptime)}` : "离线"}
            </Badge>
            {node.agentVersion ? (
              <Badge tone="muted" className="font-mono">
                agent {node.agentVersion}
              </Badge>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-3 lg:grid-cols-4">
            <InfoItem label="系统">
              {node.os || "—"}
              {node.kernel ? ` · ${node.kernel}` : ""}
            </InfoItem>
            <InfoItem label="架构">
              {node.arch || "—"} · {metrics.process} 进程
            </InfoItem>
            <InfoItem label="续费">
              {node.price > 0
                ? `${formatPrice(node.price, node.currency)} / ${formatBillingCycle(node.billingCycle) || "—"}`
                : "免费"}
              {days === null
                ? " · 永不到期"
                : days < 0
                  ? ` · 已过期 ${-days} 天`
                  : ` · ${node.expireDate} 到期`}
            </InfoItem>
            <InfoItem label="CPU">
              {node.cpuName || "—"}
              {node.cpuCores > 0 ? ` × ${node.cpuCores}` : ""}
            </InfoItem>
            <InfoItem label="内存 / 磁盘">
              {formatBytes(metrics.ramUsed)} / {formatBytes(metrics.ramTotal)}
              <span className="text-muted-foreground"> · </span>
              {formatBytes(metrics.diskUsed)} / {formatBytes(metrics.diskTotal)}
            </InfoItem>
            <InfoItem label="实时网速">
              ↓ {formatSpeed(metrics.netDown)} · ↑ {formatSpeed(metrics.netUp)}
            </InfoItem>
            <InfoItem label="负载">
              {metrics.load1.toFixed(2)} / {metrics.load5.toFixed(2)} / {metrics.load15.toFixed(2)}
            </InfoItem>
            <InfoItem label="本月流量">
              {formatBytes(trafficUsed)}
              {node.trafficLimit > 0 ? ` / ${formatBytes(node.trafficLimit)}` : " / ∞"}
            </InfoItem>
          </div>

          <div className="mt-3 space-y-2 border-t border-hairline pt-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 text-muted-foreground">内存</span>
              <ProgressBar value={metrics.ramPct} className="flex-1" />
              <span className="tnum w-12 text-right">{formatPercent(metrics.ramPct, 0)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 text-muted-foreground">磁盘</span>
              <ProgressBar value={metrics.diskPct} className="flex-1" />
              <span className="tnum w-12 text-right">{formatPercent(metrics.diskPct, 0)}</span>
            </div>
          </div>
        </GlassPanel>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-hairline p-0.5">
            {(
              [
                { value: "resource", label: "资源" },
                { value: "latency", label: "网络延迟" },
              ] as Array<{ value: Tab; label: string }>
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                className={cn(
                  "rounded px-3 py-1 text-xs transition-colors",
                  tab === item.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="ml-auto inline-flex rounded-md border border-hairline p-0.5">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                type="button"
                onClick={() => setHours(range.hours)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  hours === range.hours
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
        ) : history.load.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有历史数据</p>
        ) : tab === "resource" ? (
          <div className="space-y-3">
            <ChartBlock title="CPU" subtitle={formatPercent(metrics.cpuPct)}>
              <TimeSeriesChart
                times={loadTimes}
                series={resourceSeries}
                yFormatter={(value) => `${value.toFixed(0)}%`}
              />
            </ChartBlock>
            <ChartBlock title="内存" subtitle={formatBytes(metrics.ramTotal)}>
              <TimeSeriesChart
                times={loadTimes}
                series={memSeries}
                yFormatter={(value) => `${value.toFixed(0)}%`}
              />
            </ChartBlock>
            <ChartBlock title="网络速率">
              <TimeSeriesChart
                times={loadTimes}
                series={netSeries}
                yFormatter={(value) => formatSpeed(value)}
              />
            </ChartBlock>
            <ChartBlock title="磁盘" subtitle={formatBytes(metrics.diskTotal)}>
              <TimeSeriesChart
                times={loadTimes}
                series={diskSeries}
                yFormatter={(value) => `${value.toFixed(0)}%`}
              />
            </ChartBlock>
          </div>
        ) : (
          <div className="space-y-3">
            <GlassPanel className="p-3">
              <h3 className="mb-2 text-sm font-medium">各线路健康分</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CARRIER_KEYS.map((key) => (
                  <div key={key} className="rounded-lg border border-hairline bg-card-subtle p-2">
                    <div className="text-xs text-muted-foreground">{key.toUpperCase()}</div>
                    <div className="tnum mt-0.5 text-sm">
                      {formatLatency(node.ping.ping[key])} · 丢 {formatLoss(node.ping.loss[key])}
                    </div>
                    <div className="tnum mt-0.5 text-xs text-muted-foreground">
                      {health[key] == null ? "无数据" : `${health[key]!.toFixed(0)} 分`}
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <ChartBlock title="延迟">
              {history.ping.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
              ) : (
                <TimeSeriesChart
                  times={pingTimes}
                  series={pingSeries}
                  yFormatter={(value) => `${value.toFixed(0)}ms`}
                />
              )}
            </ChartBlock>

            <ChartBlock title="丢包">
              {history.ping.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
              ) : (
                <TimeSeriesChart
                  times={pingTimes}
                  series={lossSeries}
                  yRange={[0, 100]}
                  yFormatter={(value) => `${value.toFixed(0)}%`}
                />
              )}
            </ChartBlock>
          </div>
        )}
      </div>
    </AppShell>
  );
}
