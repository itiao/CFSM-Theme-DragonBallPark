import { Activity, HeartPulse, LogIn, Moon, Settings, Sun, User } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { LINK_BUTTON_CLASS } from "@/components/ui/linkButton";
import { useAppData } from "@/app/AppData";
import { useAppearance } from "@/hooks/useAppearance";
import { getAdminUrl } from "@/services/cfsm/config";
import { CARRIER_KEYS } from "@/services/cfsm/types";
import { HEALTH_GRADE_LABEL, computeHealthScore } from "@/services/healthScore";
import { cn } from "@/lib/cn";
import { formatLatency } from "@/utils/format";

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { config, nodes, stats } = useAppData();
  const { resolved, cycle } = useAppearance();
  const location = useLocation();

  const avgLatency = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const node of nodes) {
      if (!node.metrics.online) continue;
      for (const key of CARRIER_KEYS) {
        const value = node.ping.ping[key];
        if (value == null) continue;
        sum += value;
        count += 1;
      }
    }
    return count === 0 ? null : sum / count;
  }, [nodes]);

  const health = useMemo(() => computeHealthScore(nodes), [nodes]);

  const loggedIn = Boolean(config?.authorization);
  const title = config?.siteTitle || "服务器监控";

  return (
    <header className="glass sticky top-0 z-40 flex items-center gap-2 rounded-none border-x-0 border-t-0 px-3 py-2">
      {location.pathname !== "/" ? (
        <Link to="/" className={LINK_BUTTON_CLASS}>
          ← 返回列表
        </Link>
      ) : null}

      <Link to="/" className="flex shrink-0 items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-chart-1/15 text-chart-1">
          <Activity className="size-3.5" />
        </span>
        <span className="truncate text-sm font-semibold">{title}</span>
      </Link>

      <div className="ml-1 hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        <span className="tnum">
          在线{" "}
          <span className={cn("font-medium", stats.online === stats.total ? "text-ok" : "text-warn")}>
            {stats.online}/{stats.total}
          </span>
        </span>
        <span className="tnum">平均延迟 {formatLatency(avgLatency)}</span>
        <span
          className={cn(
            "tnum inline-flex items-center gap-1",
            health.grade === "poor"
              ? "text-danger"
              : health.grade === "fair"
                ? "text-warn"
                : health.grade === "unknown"
                  ? "text-muted-foreground"
                  : "text-ok",
          )}
          title={`由延迟与丢包自算，${health.sampled} 台在线节点参与`}
        >
          <HeartPulse className="size-3.5" aria-hidden />
          {health.score == null ? HEALTH_GRADE_LABEL.unknown : `${health.score.toFixed(1)}分`}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={cycle}
          title={`切换明暗（当前：${resolved === "dark" ? "暗色" : "亮色"}）`}
          aria-label="切换明暗"
        >
          {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenSettings} title="设置" aria-label="设置">
          <Settings className="size-4" />
        </Button>
        <a href={getAdminUrl()} className={LINK_BUTTON_CLASS}>
          {loggedIn ? <User className="size-3.5" /> : <LogIn className="size-3.5" />}
          {loggedIn ? "后台" : "登录"}
        </a>
      </div>
    </header>
  );
}
