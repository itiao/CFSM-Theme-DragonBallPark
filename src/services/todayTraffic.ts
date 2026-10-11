/**
 * 「今日流量」估算。
 *
 * CF-Server-Monitor 的后端只保存上/下行的**瞬时速率**，没有当天的累计计数器，
 * 所以当日流量只能拿速率按采样间隔积分估出来：
 *
 *   今日流量 += 速率 × 相邻两次采样的时间差
 *
 * 三条自我约束，避免给出一个离谱的数：
 * 1. **只累计页面开着的时段** —— 单次积分的间隔封顶 `MAX_STEP_MS`（90 秒），
 *    标签页挂起或关掉的那段时间不计数（那段时间我们根本不知道发生了什么）。
 * 2. **跨天重置** —— 本地日界一到就把计数清零。
 * 3. **离线不计** —— 节点离线时速率视为 0。
 *
 * 因此这是个**下限估计**，界面上要明确标注是估算值。
 */

import type { Node } from "./cfsm/types";

const STORAGE_KEY = "dragon-park.todayTraffic.v1";
const MAX_STEP_MS = 90_000;

export interface TodayTraffic {
  rx: number;
  tx: number;
}

interface PersistedNode extends TodayTraffic {
  lastAt: number;
}

interface Persisted {
  day: string;
  nodes: Record<string, PersistedNode>;
}

type Listener = () => void;

function localDayKey(now = Date.now()): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function read(): Persisted {
  const empty: Persisted = { day: localDayKey(), nodes: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed || typeof parsed !== "object") return empty;
    if (parsed.day !== empty.day) return empty; // 跨天，直接重来
    return { day: parsed.day, nodes: parsed.nodes ?? {} };
  } catch {
    return empty;
  }
}

class TodayTrafficStore {
  private state: Persisted = read();
  private listeners = new Set<Listener>();
  private snapshot: Record<string, TodayTraffic> = {};
  private saveTimer: number | null = null;

  constructor() {
    this.rebuildSnapshot();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Record<string, TodayTraffic> => this.snapshot;

  get(nodeId: string): TodayTraffic {
    return this.snapshot[nodeId] ?? { rx: 0, tx: 0 };
  }

  /** 每次节点状态提交后调用，用当前速率推进积分。 */
  ingest(nodes: Node[], now = Date.now()): void {
    if (this.state.day !== localDayKey(now)) {
      this.state = { day: localDayKey(now), nodes: {} };
    }

    let touched = false;
    const seen = new Set<string>();

    for (const node of nodes) {
      seen.add(node.id);
      const previous = this.state.nodes[node.id];
      const online = node.metrics.online;
      const rx = online ? node.metrics.netDown : 0;
      const tx = online ? node.metrics.netUp : 0;

      if (!previous) {
        this.state.nodes[node.id] = { rx: 0, tx: 0, lastAt: now };
        touched = true;
        continue;
      }

      const elapsed = Math.min(Math.max(0, now - previous.lastAt), MAX_STEP_MS);
      if (elapsed > 0) {
        previous.rx += (rx * elapsed) / 1000;
        previous.tx += (tx * elapsed) / 1000;
      }
      previous.lastAt = now;
      touched = true;
    }

    // 节点被删掉后清掉它的残留，避免 localStorage 无限膨胀。
    for (const id of Object.keys(this.state.nodes)) {
      if (!seen.has(id)) {
        delete this.state.nodes[id];
        touched = true;
      }
    }

    if (!touched) return;
    this.rebuildSnapshot();
    this.scheduleSave();
    for (const listener of [...this.listeners]) listener();
  }

  /** 供「重置」按钮使用。 */
  reset(): void {
    this.state = { day: localDayKey(), nodes: {} };
    this.rebuildSnapshot();
    this.scheduleSave();
    for (const listener of [...this.listeners]) listener();
  }

  private rebuildSnapshot(): void {
    const next: Record<string, TodayTraffic> = {};
    for (const [id, value] of Object.entries(this.state.nodes)) {
      next[id] = { rx: value.rx, tx: value.tx };
    }
    this.snapshot = next;
  }

  private scheduleSave(): void {
    if (this.saveTimer != null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // 隐私模式下写不进去，估算值就只活在这一页。
      }
    }, 2_000);
  }
}

export const todayTrafficStore = new TodayTrafficStore();
