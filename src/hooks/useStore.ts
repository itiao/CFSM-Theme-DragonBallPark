import { useSyncExternalStore } from "react";

import { nodeStore, type StoreSnapshot } from "@/services/store";
import { todayTrafficStore, type TodayTraffic } from "@/services/todayTraffic";

export function useNodeStore(): StoreSnapshot {
  return useSyncExternalStore(nodeStore.subscribe, nodeStore.getSnapshot, nodeStore.getSnapshot);
}

export function useTodayTraffic(): Record<string, TodayTraffic> {
  return useSyncExternalStore(
    todayTrafficStore.subscribe,
    todayTrafficStore.getSnapshot,
    todayTrafficStore.getSnapshot,
  );
}
