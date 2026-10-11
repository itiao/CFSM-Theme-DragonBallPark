import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { NodeList } from "@/components/node/NodeList";
import { OverviewCards, SPARK_POINTS } from "@/components/node/OverviewCards";
import { useAppData } from "@/app/AppData";
import { useTodayTraffic } from "@/hooks/useStore";
import { getSettings, subscribeSettings } from "@/services/settings";
import { cn } from "@/lib/cn";

/**
 * 3D 公园懒加载：three.js 有 ~580KB，列表模式或首屏不需要它。
 * 切到公园模式才拉这个 chunk。
 */
const ParkScene = lazy(() =>
  import("@/components/park/ParkScene").then((module) => ({ default: module.ParkScene })),
);

/** 全局网速的滚动缓冲，供总览卡画迷你走势图。 */
function useSparkBuffer(rx: number, tx: number, length = SPARK_POINTS) {
  const buffer = useRef<{ rx: number[]; tx: number[] }>({ rx: [], tx: [] });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const next = buffer.current;
    next.rx = [...next.rx, rx].slice(-length);
    next.tx = [...next.tx, tx].slice(-length);
    setVersion((value) => value + 1);
    // rx/tx 每次都可能是同一个数，用版本号强制刷新由 setVersion 负责，这里只需依赖值。
  }, [rx, tx, length]);

  return useMemo(() => buffer.current, [version]);
}

export function Home() {
  const { nodes, stats, ready, error, setSubscribeIds } = useAppData();
  const today = useTodayTraffic();
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const [panelOpen, setPanelOpen] = useState(true);

  // 首页订阅全站。
  useEffect(() => {
    setSubscribeIds(null);
  }, [setSubscribeIds]);

  const spark = useSparkBuffer(stats.globalSpeedIn, stats.globalSpeedOut);

  const visibleNodes = useMemo(() => nodes.filter((node) => !node.hidden), [nodes]);
  const showPark = settings.view === "park";

  return (
    <AppShell>
      <div className="relative flex min-h-0 flex-1">
        {showPark ? (
          <Suspense fallback={<div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${settings.backgroundUrl}")` }} />}>
            <ParkScene
              nodes={visibleNodes}
              evolutionDays={settings.evolutionDays}
              parkExtra={settings.parkExtra}
              reduceMotion={settings.reduceMotion}
              backgroundUrl={settings.backgroundUrl}
              assetBase={settings.assetBase}
            />
          </Suspense>
        ) : null}

        <div
          className={cn(
            "scroll-thin flex min-h-0 flex-col overflow-y-auto",
            showPark
              ? cn(
                  "ml-auto w-full max-w-md border-l border-hairline bg-background/60 backdrop-blur-md transition-[width,opacity]",
                  !panelOpen && "pointer-events-none w-0 max-w-0 opacity-0",
                )
              : "mx-auto w-full max-w-5xl",
          )}
        >
          <div className="space-y-3 p-3">
            <OverviewCards nodes={visibleNodes} stats={stats} today={today} spark={spark} />

            {error ? (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-sm font-semibold">节点列表</h2>
              <span className="tnum text-xs text-muted-foreground">{visibleNodes.length} 台</span>
            </div>
          </div>

          {!ready ? (
            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
          ) : (
            <NodeList nodes={visibleNodes} today={today} showPrice={settings.showPrice} />
          )}
        </div>

        {showPark ? (
          <button
            type="button"
            onClick={() => setPanelOpen((value) => !value)}
            className="glass absolute top-3 right-3 z-20 rounded-md px-2 py-1 text-xs shadow"
          >
            {panelOpen ? "收起列表" : "节点列表"}
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}
