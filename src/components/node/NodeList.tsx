import { useMemo, useState } from "react";

import { NodeCard } from "@/components/node/NodeCard";
import { Button } from "@/components/ui/Button";
import type { Node } from "@/services/cfsm/types";
import type { TodayTraffic } from "@/services/todayTraffic";
import { cn } from "@/lib/cn";

export type SortField = "default" | "name" | "cpu" | "speed";

const SORT_LABEL: Record<SortField, string> = {
  default: "默认",
  name: "名称",
  cpu: "CPU",
  speed: "网速",
};

export function NodeList({
  nodes,
  today,
  showPrice,
}: {
  nodes: Node[];
  today: Record<string, TodayTraffic>;
  showPrice: boolean;
}) {
  const [region, setRegion] = useState<string>("__all__");
  const [sort, setSort] = useState<SortField>("default");

  const regions = useMemo(() => {
    const counter = new Map<string, number>();
    for (const node of nodes) {
      const key = node.region || "其他";
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [nodes]);

  const visible = useMemo(() => {
    const filtered =
      region === "__all__"
        ? nodes
        : nodes.filter((node) => (node.region || "其他") === region);
    if (sort === "default") return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name, "zh-Hans-CN");
        case "cpu":
          return b.metrics.cpuPct - a.metrics.cpuPct;
        case "speed":
          return (
            b.metrics.netUp + b.metrics.netDown - (a.metrics.netUp + a.metrics.netDown)
          );
        default:
          return 0;
      }
    });
    return copy;
  }, [nodes, region, sort]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2">
        <button
          type="button"
          onClick={() => setRegion("__all__")}
          className={cn(
            "rounded-md px-2 py-0.5 text-xs transition-colors",
            region === "__all__" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
          )}
        >
          全部 {nodes.length}
        </button>
        {regions.map(([key, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRegion(key)}
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs transition-colors",
              region === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {key} {count}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-xs text-muted-foreground">排序</span>
        {(Object.keys(SORT_LABEL) as SortField[]).map((field) => (
          <Button
            key={field}
            size="xs"
            variant={sort === field ? "secondary" : "ghost"}
            onClick={() => setSort(field)}
          >
            {SORT_LABEL[field]}
          </Button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">还没有节点</p>
        ) : (
          visible.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              today={today[node.id] ?? { rx: 0, tx: 0 }}
              showPrice={showPrice}
            />
          ))
        )}
      </div>
    </div>
  );
}
