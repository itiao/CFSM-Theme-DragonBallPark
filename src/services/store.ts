/**
 * 节点状态 store。
 *
 * 职责：持有 `/api/servers` 拉回来的原始数据 + WebSocket 增量合并，
 * 并对外给出展示模型。
 *
 * 两条硬约束（官方规范）：
 * 1. **渲染节流到每秒最多一次**：WS 推送频率很高，不能收到一条就重渲染一次；
 *    先把样本攒在内存里，最多每秒批量合并一次。
 * 2. **增量覆盖式 merge**：高频样本只有 CPU/内存/网速，报告级字段（磁盘、ping/loss…）
 *    只在每次上报的最后一个样本里带；缺失字段必须保留旧值。
 */

import { applySampleToServer, isServerOnline, mapServer } from "./cfsm/mappers";
import type { Node, OverviewStats, RawServer } from "./cfsm/types";
import type { WsBatchUpdate, WsStatus } from "./cfsm/wsClient";

/** 两次提交之间的最小间隔：保证每秒最多渲染一次。 */
const FLUSH_INTERVAL_MS = 1_000;

export interface StoreSnapshot {
  nodes: Node[];
  stats: OverviewStats;
  status: WsStatus;
  /** 最近一次成功合并数据的时刻（毫秒）。 */
  lastMergedAt: number;
  /** 首次数据是否已到位。 */
  ready: boolean;
  /** 全局错误信息（首次加载失败时）。 */
  error: string | null;
}

type Listener = () => void;

class NodeStore {
  private raw = new Map<string, RawServer>();
  private pending = new Map<string, RawServer>();
  private listeners = new Set<Listener>();
  private flushTimer: number | null = null;
  private lastFlushAt = 0;
  private status: WsStatus = "idle";
  private ready = false;
  private error: string | null = null;
  private snapshot: StoreSnapshot = {
    nodes: [],
    stats: { total: 0, online: 0, offline: 0, globalSpeedIn: 0, globalSpeedOut: 0 },
    status: "idle",
    lastMergedAt: 0,
    ready: false,
    error: null,
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StoreSnapshot => this.snapshot;

  /** 首次（或切回前台）用 REST 结果整体替换。 */
  replaceAll(servers: RawServer[]): void {
    this.raw = new Map(servers.map((server) => [String(server.id), server]));
    this.pending.clear();
    this.ready = true;
    this.error = null;
    // force：pending 刚被清空，不 force 的话 commit 会以为「没有新数据」直接返回。
    this.commit(Date.now(), true);
  }

  setError(message: string): void {
    this.error = message;
    this.ready = true;
    this.commit(Date.now());
  }

  setStatus(status: WsStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.commit(Date.now(), true);
  }

  /** 收到 WS 批量更新：只入队，不立刻渲染。 */
  applyBatch(updates: WsBatchUpdate[]): void {
    for (const update of updates) {
      const id = String(update.serverId);
      const base = this.pending.get(id) ?? this.raw.get(id);
      if (!base) continue; // 未知节点（后端新加、还没重新拉列表）直接忽略
      let merged = base;
      for (const sample of update.samples) {
        merged = applySampleToServer(merged, sample.payload);
      }
      if (update.reportTs) merged = { ...merged, report_timestamp: update.reportTs };
      this.pending.set(id, merged);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer != null) return;
    const elapsed = Date.now() - this.lastFlushAt;
    const delay = Math.max(0, FLUSH_INTERVAL_MS - elapsed);
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.commit(Date.now());
    }, delay);
  }

  /** 把 pending 合并进 raw，重算展示模型并通知订阅者。 */
  private commit(now: number, force = false): void {
    const hadPending = this.pending.size > 0;
    if (hadPending) {
      for (const [id, server] of this.pending) this.raw.set(id, server);
      this.pending.clear();
    }
    this.lastFlushAt = now;

    // 没有新数据、状态也没变时不必惊动订阅者（例如切回前台只补一次 REST）。
    if (!force && !hadPending) return;

    const servers = [...this.raw.values()];
    const nodes = servers.map((server) => mapServer(server, now));
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id, "en", { numeric: true }));

    const online = nodes.filter((node) => node.metrics.online).length;
    const stats: OverviewStats = {
      total: nodes.length,
      online,
      offline: nodes.length - online,
      globalSpeedIn: nodes.reduce((sum, node) => sum + (node.metrics.online ? node.metrics.netDown : 0), 0),
      globalSpeedOut: nodes.reduce((sum, node) => sum + (node.metrics.online ? node.metrics.netUp : 0), 0),
    };

    this.snapshot = {
      nodes,
      stats,
      status: this.status,
      lastMergedAt: now,
      ready: this.ready,
      error: this.error,
    };
    for (const listener of [...this.listeners]) listener();
  }
}

export const nodeStore = new NodeStore();

export { isServerOnline };
