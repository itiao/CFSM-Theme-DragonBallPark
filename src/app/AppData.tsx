/**
 * 全局数据装配：把「官方数据流」的三件事接起来。
 *
 *   1. 首次载入：`GET /api/config`（全生命周期只查一次）
 *   2. 首页：`GET /api/servers`（仅一次）+ `wss /api/ws?subscribe=all`
 *   3. 页面隐藏时断开 WS，切回来先补一次 REST 再重连
 *
 * 除这三条之外不再发任何 REST，也没有任何 setInterval 轮询。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isMockEnabled } from "@/dev/mockApi";
import { getConfig, getServers, invalidateConfig } from "@/services/cfsm/api";
import { getPrimaryApiBase, subscribeJwtTokenCleared } from "@/services/cfsm/config";
import type { Node, OverviewStats, PublicConfig } from "@/services/cfsm/types";
import { WsClient, type WsStatus } from "@/services/cfsm/wsClient";
import { nodeStore } from "@/services/store";
import { todayTrafficStore } from "@/services/todayTraffic";
import { useNodeStore, useTodayTraffic } from "@/hooks/useStore";

export interface AppDataValue {
  config: PublicConfig | null;
  ready: boolean;
  error: string | null;
  nodes: Node[];
  stats: OverviewStats;
  wsStatus: WsStatus;
  /** 连满 `frontend_ws_timeout_minutes`，等用户决定要不要继续。 */
  sessionTimedOut: boolean;
  /** 用户选择继续：重连并重置计时。 */
  continueSession: () => void;
  /** 用户选择关闭：保持断开，刷新页面才会重新开始。 */
  endSession: () => void;
  /** 详情页用：只订阅这一台；传 null 回到全站订阅。不重连。 */
  setSubscribeIds: (ids: string[] | null) => void;
  /** 401/403 之后重新拉一次配置（登录态 / 人机验证变了）。 */
  reloadConfig: () => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData 必须在 AppDataProvider 内使用");
  return value;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  const wsRef = useRef<WsClient | null>(null);
  const snapshot = useNodeStore();
  const todayTraffic = useTodayTraffic();

  const loadConfig = useCallback(async (force = false) => {
    try {
      const value = await getConfig(force);
      setConfig(value);
      return value;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "站点配置加载失败");
      return null;
    }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      const servers = await getServers();
      nodeStore.replaceAll(servers);
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "节点数据加载失败";
      nodeStore.setError(message);
      setError(message);
    }
  }, []);

  /* ---------------- 首次载入 ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const value = await loadConfig();
      if (cancelled) return;
      await loadServers();
      if (cancelled) return;
      setReady(true);

      // mock 模式下没有后端，也不去连 WS。
      if (isMockEnabled()) return;

      const ws = new WsClient({
        onBatchUpdate: (updates) => nodeStore.applyBatch(updates),
        onStatusChange: (status) => setWsStatus(status),
        onSessionTimeout: () => {
          setSessionTimedOut(true);
          ws.stopForSession();
        },
      });
      ws.setSessionLimitMinutes(value?.frontendWsTimeoutMinutes ?? 0);
      wsRef.current = ws;
      ws.connect(getPrimaryApiBase(), { type: "all" });
    })();

    return () => {
      cancelled = true;
      wsRef.current?.dispose();
      wsRef.current = null;
    };
  }, [loadConfig, loadServers]);

  /* ---------------- 令牌失效时重查配置 ---------------- */
  useEffect(() => {
    return subscribeJwtTokenCleared(() => {
      invalidateConfig();
      void loadConfig(true);
    });
  }, [loadConfig]);

  /* ---------------- 页面隐藏时止损 ---------------- */
  useEffect(() => {
    const onVisibility = () => {
      const ws = wsRef.current;
      if (!ws) return;
      if (document.hidden) {
        ws.setPaused(true);
      } else {
        // 切回来先补一次 REST，把挂起期间的空白接上，再重连。
        void loadServers().then(() => ws.setPaused(false));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadServers]);

  /* ---------------- 会话上限 ---------------- */
  useEffect(() => {
    wsRef.current?.setSessionLimitMinutes(config?.frontendWsTimeoutMinutes ?? 0);
  }, [config?.frontendWsTimeoutMinutes]);

  /* ---------------- 今日流量积分 ---------------- */
  useEffect(() => {
    todayTrafficStore.ingest(snapshot.nodes);
  }, [snapshot.nodes, snapshot.lastMergedAt]);

  const continueSession = useCallback(() => {
    setSessionTimedOut(false);
    const ws = wsRef.current;
    if (!ws) return;
    // stopForSession 把 paused 置成了 true，这里复位后重连。
    ws.setPaused(false);
  }, []);

  const endSession = useCallback(() => {
    setSessionTimedOut(false);
    wsRef.current?.stopForSession();
  }, []);

  const setSubscribeIds = useCallback((ids: string[] | null) => {
    wsRef.current?.setScope(ids && ids.length > 0 ? { type: "ids", ids } : { type: "all" });
  }, []);

  const reloadConfig = useCallback(() => {
    invalidateConfig();
    void loadConfig(true);
  }, [loadConfig]);

  const value = useMemo<AppDataValue>(
    () => ({
      config,
      ready,
      error,
      nodes: snapshot.nodes,
      stats: snapshot.stats,
      wsStatus,
      sessionTimedOut,
      continueSession,
      endSession,
      setSubscribeIds,
      reloadConfig,
    }),
    [
      config,
      ready,
      error,
      snapshot.nodes,
      snapshot.stats,
      wsStatus,
      sessionTimedOut,
      continueSession,
      endSession,
      setSubscribeIds,
      reloadConfig,
    ],
  );

  // todayTraffic 在这里消费一次，保证 store 的订阅是活的（值本身由各页面自行取用）。
  void todayTraffic;

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
