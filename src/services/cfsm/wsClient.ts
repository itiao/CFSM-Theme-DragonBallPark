/**
 * `/api/ws` 订阅客户端。
 *
 * 遵守官方规范：
 * - 断线按指数退避重连（1、2、4… 秒，30 秒封顶），连续 10 次失败就停手；
 * - 页面隐藏时断开（后端只要有人连着就让全站探针加密上报），重新可见时重连并补一次 REST；
 * - 遵守 `frontend_ws_timeout_minutes`：到点断开并询问用户是否继续，不静默重连；
 * - 详情页用 `subscribe=<id>` 单订阅，首页用 `subscribe=all`，切页只改订阅不重连。
 */

import { getJwtToken, toWebSocketBase } from "./config";

export type WsScope = { type: "all" } | { type: "ids"; ids: string[] };

export interface WsBatchUpdate {
  serverId: string;
  reportTs?: number;
  samples: Array<{ ts?: number; payload: Record<string, unknown> }>;
}

export interface WsClientHandlers {
  onBatchUpdate: (updates: WsBatchUpdate[]) => void;
  onStatusChange?: (status: WsStatus) => void;
  /** 连满 `frontend_ws_timeout_minutes` 时触发，由界面问用户要不要继续。 */
  onSessionTimeout?: () => void;
}

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "timeout";

const MAX_BACKOFF_MS = 30_000;
const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 1_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

export class WsClient {
  private socket: WebSocket | null = null;
  private base = "";
  private scope: WsScope = { type: "all" };
  private attempts = 0;
  private retryTimer: number | null = null;
  private sessionTimer: number | null = null;
  private sessionLimitMinutes = 0;
  private paused = false;
  private disposed = false;
  private readonly handlers: WsClientHandlers;

  constructor(handlers: WsClientHandlers) {
    this.handlers = handlers;
  }

  get status(): WsStatus {
    if (this.disposed) return "closed";
    if (this.paused) return "closed";
    if (!this.socket) return "idle";
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "open";
      default:
        return "closed";
    }
  }

  setSessionLimitMinutes(minutes: number): void {
    this.sessionLimitMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }

  /** 建立连接（若已连上则只更新订阅）。 */
  connect(base: string, scope: WsScope): void {
    if (this.disposed) return;
    const baseChanged = base !== this.base;
    this.base = base;
    const scopeChanged = JSON.stringify(scope) !== JSON.stringify(this.scope);
    this.scope = scope;

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      if (scopeChanged) this.sendSubscribe();
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) return;
    if (!baseChanged && this.paused) return;
    this.open();
  }

  /** 只改订阅，不重连（首页 ↔ 详情页切换用）。 */
  setScope(scope: WsScope): void {
    const changed = JSON.stringify(scope) !== JSON.stringify(this.scope);
    this.scope = scope;
    if (changed && this.socket?.readyState === WebSocket.OPEN) this.sendSubscribe();
  }

  /** 页面隐藏 / 显示。 */
  setPaused(paused: boolean): void {
    if (this.disposed) return;
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.teardownSocket();
      this.clearRetry();
      this.handlers.onStatusChange?.("closed");
    } else {
      this.attempts = 0;
      this.open();
    }
  }

  /** 会话超时后用户选择「关闭」：保持断开，刷新页面才会重新开始。 */
  stopForSession(): void {
    this.paused = true;
    this.clearSessionTimer();
    this.teardownSocket();
    this.clearRetry();
    this.handlers.onStatusChange?.("timeout");
  }

  dispose(): void {
    this.disposed = true;
    this.clearRetry();
    this.clearSessionTimer();
    this.teardownSocket();
  }

  /* ---------------------------------------------------------------- */

  private open(): void {
    if (this.disposed || this.paused) return;
    this.teardownSocket();

    const url = new URL(`${toWebSocketBase(this.base)}/api/ws`);
    // 建连时就把当前订阅写进 URL（官方规范要求详情页用 subscribe=<id>）；
    // 之后同一条连接上改订阅走 in-band 消息，不重连。
    url.searchParams.set(
      "subscribe",
      this.scope.type === "all" ? "all" : this.scope.ids.join(","),
    );
    // WS 不能带 Header：跨域时把 JWT 挂在 URL 上（同域靠 cfsm_auth Cookie）。
    const jwt = getJwtToken();
    if (jwt) url.searchParams.set("token", jwt);

    this.handlers.onStatusChange?.("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(url.toString());
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempts = 0;
      this.handlers.onStatusChange?.("open");
      this.sendSubscribe();
      this.startSessionTimer();
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      // onclose 会跟着来，统一在那里重连。
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearSessionTimer();
      if (this.disposed || this.paused) {
        this.handlers.onStatusChange?.("closed");
        return;
      }
      this.handlers.onStatusChange?.("closed");
      this.scheduleRetry();
    };
  }

  private sendSubscribe(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const message =
      this.scope.type === "all"
        ? { type: "subscribe", scope: "all" }
        : { type: "subscribe", scope: "ids", ids: this.scope.ids };
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // 发不出去就等 onclose 重连。
    }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const message = asRecord(parsed);
    const type = asString(message.type);

    if (type !== "batchUpdate" && type !== "update") {
      // 其它消息（含 subscribe 回执）不处理。
      return;
    }

    const updates: WsBatchUpdate[] = [];
    for (const entry of asArray(message.updates)) {
      const record = asRecord(entry);
      const serverId = asString(record.serverId ?? record.id);
      if (!serverId) continue;
      const samples: WsBatchUpdate["samples"] = [];
      for (const sample of asArray(record.samples)) {
        const sampleRecord = asRecord(sample);
        const payload = asRecord(sampleRecord.data ?? sampleRecord.payload ?? sampleRecord.metrics);
        if (Object.keys(payload).length === 0) continue;
        samples.push({ ts: typeof sampleRecord.ts === "number" ? sampleRecord.ts : undefined, payload });
      }
      updates.push({
        serverId,
        reportTs: typeof record.reportTs === "number" ? record.reportTs : undefined,
        samples,
      });
    }

    if (updates.length > 0) this.handlers.onBatchUpdate(updates);
  }

  private startSessionTimer(): void {
    this.clearSessionTimer();
    if (this.sessionLimitMinutes <= 0) return;
    this.sessionTimer = window.setTimeout(() => {
      this.handlers.onSessionTimeout?.();
    }, this.sessionLimitMinutes * 60_000);
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer != null) {
      window.clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  private scheduleRetry(): void {
    if (this.disposed || this.paused) return;
    if (this.attempts >= MAX_ATTEMPTS) return;
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.attempts, MAX_BACKOFF_MS);
    this.attempts += 1;
    this.clearRetry();
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer != null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private teardownSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch {
      // 忽略
    }
  }
}
