/**
 * 后端原始结构 → 主题展示模型。
 *
 * 单位约定（与后端一致）：
 * - `ram_*` / `swap_*` / `disk_*` 为 **MiB**，这里统一换算成字节给 UI。
 * - 网络速率与累计量为 **字节** / **字节每秒**。
 * - `traffic_limit` 为 **GB**，这里换算成字节。
 * - `boot_time` / `last_updated` 为 **毫秒**时间戳。
 */

import {
  asArray,
  asBoolFlag,
  asId,
  asNumber,
  asNumberOrNull,
  asObjectArray,
  asRecord,
  asString,
} from "./coerce";
import {
  CARRIER_KEYS,
  DEFAULT_CARRIER_NAMES,
  type CarrierKey,
  type CarrierNames,
  type Node,
  type NodeMetrics,
  type NodePing,
  type OverviewStats,
  type PublicConfig,
  type RawHistoryRow,
  type RawLatencyPoint,
  type RawSample,
  type RawServer,
  type RawServersResponse,
  type RawSiteConfig,
} from "./types";

const MIB = 1024 * 1024;
const GIB = 1024 * 1024 * 1024;

/** 在线判定窗口：后端最近 5 分钟内收到过上报（与内置主题同口径）。 */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isServerOnline(server: Pick<RawServer, "last_updated">, now = Date.now()): boolean {
  const updated = asNumber(server.last_updated, 0);
  if (!updated) return false;
  return now - updated < ONLINE_WINDOW_MS;
}

function parseLoadAvg(value: unknown): [number, number, number] {
  const parts = asString(value, "")
    .trim()
    .split(/\s+/)
    .map((item) => Number.parseFloat(item))
    .map((item) => (Number.isFinite(item) ? item : 0));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function mapLatencyWindow(value: unknown): RawLatencyPoint[] | null {
  const rows = asObjectArray(value);
  if (rows.length === 0) return null;
  return rows.map((row) => ({
    ts: asNumber(row.ts, 0),
    ct: asNumberOrNull(row.ct),
    cu: asNumberOrNull(row.cu),
    cm: asNumberOrNull(row.cm),
    bd: asNumberOrNull(row.bd),
  }));
}

function mapPing(server: RawServer): NodePing {
  const ping = {} as Record<CarrierKey, number | null>;
  const loss = {} as Record<CarrierKey, number | null>;
  for (const key of CARRIER_KEYS) {
    ping[key] = asNumberOrNull(server[`ping_${key}` as keyof RawServer]);
    loss[key] = asNumberOrNull(server[`loss_${key}` as keyof RawServer]);
  }
  return {
    ping,
    loss,
    window: mapLatencyWindow(server.ping),
    lossWindow: mapLatencyWindow(server.loss),
  };
}

export function bootTimeToUptime(bootTime: unknown, now = Date.now()): number {
  const boot = asNumber(bootTime, 0);
  if (!boot) return 0;
  // boot_time 是毫秒时间戳；时钟偏差导致为负时归零。
  return Math.max(0, Math.floor((now - boot) / 1000));
}

function mapMetrics(server: RawServer, now: number): NodeMetrics {
  const ramTotal = asNumber(server.ram_total) * MIB;
  const ramUsed = asNumber(server.ram_used) * MIB;
  const diskTotal = asNumber(server.disk_total) * MIB;
  const diskUsed = asNumber(server.disk_used) * MIB;
  const [load1, load5, load15] = parseLoadAvg(server.load_avg);
  const online = isServerOnline(server, now);

  return {
    online,
    cpuPct: asNumber(server.cpu),
    ramUsed,
    ramTotal,
    ramPct: ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0,
    swapUsed: asNumber(server.swap_used) * MIB,
    swapTotal: asNumber(server.swap_total) * MIB,
    diskUsed,
    diskTotal,
    diskPct: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0,
    netUp: asNumber(server.net_out_speed),
    netDown: asNumber(server.net_in_speed),
    trafficUpTotal: asNumber(server.net_tx),
    trafficDownTotal: asNumber(server.net_rx),
    trafficUpMonth: asNumber(server.net_tx_monthly),
    trafficDownMonth: asNumber(server.net_rx_monthly),
    // 离线时 uptime 归零：进化玩法不该把一台关机很久的机器算成「在线时长」。
    uptime: online ? bootTimeToUptime(server.boot_time, now) : 0,
    load1,
    load5,
    load15,
    process: asNumber(server.processes),
    connectionsTcp: asNumber(server.tcp_conn),
    connectionsUdp: asNumber(server.udp_conn),
    updatedAt: asNumber(server.last_updated),
    reportAt: asNumber(server.report_timestamp, asNumber(server.last_updated)),
  };
}

export function mapServer(server: RawServer, now = Date.now()): Node {
  return {
    id: asId(server.id),
    name: asString(server.name) || "未命名",
    group: asString(server.server_group),
    region: asString(server.region).toUpperCase(),
    hidden: asBoolFlag(server.is_hidden),
    os: asString(server.os),
    arch: asString(server.arch),
    kernel: asString(server.kernel_version),
    cpuName: asString(server.cpu_info),
    cpuCores: asNumber(server.cpu_cores),
    memTotal: asNumber(server.ram_total) * MIB,
    swapTotal: asNumber(server.swap_total) * MIB,
    diskTotal: asNumber(server.disk_total) * MIB,
    agentVersion: asString(server.agent_version),
    sortOrder: asNumber(server.sort_order),
    tags: asString(server.tags),
    price: asNumber(server.price),
    currency: asString(server.currency),
    billingCycle: asString(server.billing_cycle),
    autoRenewal: asBoolFlag(server.auto_renewal),
    expireDate: asString(server.expire_date),
    trafficLimit: asNumber(server.traffic_limit) * GIB,
    trafficCalcType: asString(server.traffic_calc_type),
    trafficResetDay: asNumber(server.reset_day),
    metrics: mapMetrics(server, now),
    ping: mapPing(server),
  };
}

export interface MappedServers {
  nodes: Node[];
  stats: OverviewStats;
}

/**
 * `/api/servers` 的整体映射。
 *
 * 在线数用后端 `stats.online`（官方规范要求不要自己重算一套口径）；
 * 后端没给时退回按 `last_updated` 自己数。
 */
export function mapServersResponse(payload: unknown, now = Date.now()): MappedServers {
  const response = asRecord(payload) as unknown as RawServersResponse;
  const rawServers = asArray(response.servers) as RawServer[];
  const nodes = rawServers.map((server) => mapServer(server, now));

  const stats = asRecord(response.stats);
  const total = asNumber(stats.total, nodes.length);
  const online = stats.online == null ? nodes.filter((node) => node.metrics.online).length : asNumber(stats.online);

  return {
    nodes,
    stats: {
      total,
      online,
      offline: Math.max(0, total - online),
      globalSpeedIn: asNumber(stats.globalSpeedIn),
      globalSpeedOut: asNumber(stats.globalSpeedOut),
    },
  };
}

/** 线路显示名：站长自定义的逐条覆盖，缺的沿用默认名。 */
export function resolveCarrierNames(config: Pick<RawSiteConfig, "custom_ct_name" | "custom_cu_name" | "custom_cm_name" | "custom_bd_name">): CarrierNames {
  const custom: Record<CarrierKey, string> = {
    ct: asString(config.custom_ct_name).trim(),
    cu: asString(config.custom_cu_name).trim(),
    cm: asString(config.custom_cm_name).trim(),
    bd: asString(config.custom_bd_name).trim(),
  };
  const names = { ...DEFAULT_CARRIER_NAMES };
  for (const key of CARRIER_KEYS) {
    if (custom[key]) names[key] = custom[key];
  }
  return names;
}

export function mapSiteConfig(payload: unknown): PublicConfig {
  const raw = asRecord(payload) as unknown as RawSiteConfig;
  return {
    siteTitle: asString(raw.site_title),
    version: asString(raw.version),
    isPublic: raw.is_public !== false,
    authorization: raw.authorization === true,
    turnstileEnabled: raw.turnstile_enabled === true,
    turnstileSiteKey: asString(raw.turnstile_site_key),
    verified: raw.verified === true,
    themeOptions: asRecord(raw.theme_options),
    frontendWsTimeoutMinutes: asNumber(raw.frontend_ws_timeout_minutes, 0),
    carrierNames: resolveCarrierNames(raw),
    sysConfig: {
      show_price: raw.sysConfig?.show_price !== false,
      show_expire: raw.sysConfig?.show_expire !== false,
      show_tf: raw.sysConfig?.show_tf !== false,
      show_time: raw.sysConfig?.show_time !== false,
      show_three_net_details: raw.sysConfig?.show_three_net_details !== false,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 历史行
 * ------------------------------------------------------------------ */

export interface LoadRecord {
  time: number;
  cpu: number;
  ram: number;
  ramTotal: number;
  disk: number;
  diskTotal: number;
  netIn: number;
  netOut: number;
  load: number;
  process: number;
  connections: number;
}

export interface PingRecord {
  time: number;
  ct: number | null;
  cu: number | null;
  cm: number | null;
  bd: number | null;
  lossCt: number | null;
  lossCu: number | null;
  lossCm: number | null;
  lossBd: number | null;
}

export interface HistoryMapped {
  load: LoadRecord[];
  ping: PingRecord[];
}

function mapHistoryRow(row: Record<string, unknown>): { load: LoadRecord; ping: PingRecord } {
  const ramTotal = asNumber(row.ram_total) * MIB;
  const diskTotal = asNumber(row.disk_total) * MIB;
  const [load] = parseLoadAvg(row.load_avg);
  const time = asNumber(row.timestamp);

  return {
    load: {
      time,
      cpu: asNumber(row.cpu),
      ram: asNumber(row.ram_used) * MIB,
      ramTotal,
      disk: asNumber(row.disk_used) * MIB,
      diskTotal,
      netIn: asNumber(row.net_in_speed),
      netOut: asNumber(row.net_out_speed),
      load,
      process: asNumber(row.processes),
      connections: asNumber(row.tcp_conn) + asNumber(row.udp_conn),
    },
    ping: {
      time,
      ct: asNumberOrNull(row.ping_ct),
      cu: asNumberOrNull(row.ping_cu),
      cm: asNumberOrNull(row.ping_cm),
      bd: asNumberOrNull(row.ping_bd),
      lossCt: asNumberOrNull(row.loss_ct),
      lossCu: asNumberOrNull(row.loss_cu),
      lossCm: asNumberOrNull(row.loss_cm),
      lossBd: asNumberOrNull(row.loss_bd),
    },
  };
}

/** `/api/history/all` 的响应 → 负载 / 延迟两条序列。 */
export function mapHistoryResponse(payload: unknown): HistoryMapped {
  const raw = asRecord(payload);
  const rows = asObjectArray(raw.data ?? raw.records ?? raw.rows);
  const load: LoadRecord[] = [];
  const ping: PingRecord[] = [];
  for (const row of rows) {
    const mapped = mapHistoryRow(row as RawHistoryRow & Record<string, unknown>);
    load.push(mapped.load);
    ping.push(mapped.ping);
  }
  load.sort((a, b) => a.time - b.time);
  ping.sort((a, b) => a.time - b.time);
  return { load, ping };
}

/* ------------------------------------------------------------------ *
 * WebSocket 增量样本
 * ------------------------------------------------------------------ */

/** 从 WS / latestReportUpdates 的样本里取出指标对象。 */
export function readSamplePayload(sample: RawSample): Record<string, unknown> {
  return asRecord(sample.data ?? sample.payload ?? sample.metrics);
}

/**
 * 把增量样本叠到现有节点上（**覆盖式 merge**，缺失字段保留旧值）。
 *
 * 官方规范：高频点只有 CPU/内存/Swap/网速，最后一个样本才带磁盘、ping/loss 等报告级字段，
 * 所以绝不能整对象替换。
 */
export function applySampleToServer(server: RawServer, payload: Record<string, unknown>): RawServer {
  const next: RawServer = { ...server };
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}
