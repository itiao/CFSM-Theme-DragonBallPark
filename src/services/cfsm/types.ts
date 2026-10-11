/**
 * CF-Server-Monitor 的原始响应结构 + 主题内部的展示模型。
 * 两者之间由 `mappers.ts` 转换，UI 层只碰展示模型。
 */

/* ------------------------------------------------------------------ *
 * 后端原始结构
 * ------------------------------------------------------------------ */

/** `/api/servers` 的探测窗口点（20 个槽位）。 */
export interface RawLatencyPoint {
  ts: number;
  ct: number | null;
  cu: number | null;
  cm: number | null;
  bd: number | null;
}

export interface RawServer {
  id: string;
  name: string;
  server_group: string;
  tags: string;
  price: string;
  billing_cycle: string;
  auto_renewal: string;
  currency: string;
  expire_date: string;
  traffic_limit: string;
  traffic_calc_type: string;
  reset_day: number;
  report_interval: number;
  is_hidden: string;
  sort_order: number;

  cpu: number;
  load_avg: string;
  net_in_speed: number;
  net_out_speed: number;
  net_rx: number;
  net_tx: number;
  net_rx_monthly: number;
  net_tx_monthly: number;
  processes: number;
  tcp_conn: number;
  udp_conn: number;

  ping_ct: number | null;
  ping_cu: number | null;
  ping_cm: number | null;
  ping_bd: number | null;
  loss_ct: number | null;
  loss_cu: number | null;
  loss_cm: number | null;
  loss_bd: number | null;
  ping?: RawLatencyPoint[];
  loss?: RawLatencyPoint[];

  ram_total: number;
  ram_used: number;
  swap_total: number;
  swap_used: number;
  disk_total: number;
  disk_used: number;

  cpu_cores: number;
  cpu_info: string;
  arch: string;
  os: string;
  kernel_version: string;
  region: string;
  ip_v4: string;
  ip_v6: string;
  boot_time: string;
  agent_version: string;
  last_updated: number;
  timestamp: number;

  /** 主题补的字段：后端收到这台最近一次上报的时刻（毫秒）。判在线用它。 */
  report_timestamp?: number;
  is_online?: boolean;
}

export interface RawServersStats {
  total: number;
  online: number;
  offline: number;
  globalSpeedIn: number;
  globalSpeedOut: number;
  globalNetTx: number;
  globalNetRx: number;
}

export interface RawSysConfig {
  show_price: boolean;
  show_expire: boolean;
  show_tf: boolean;
  show_time: boolean;
  show_three_net_details: boolean;
  long_history_points?: number;
}

export interface RawServersResponse {
  servers: RawServer[];
  stats: RawServersStats;
  regionStats: Record<string, number>;
  sysConfig: RawSysConfig;
  latestReportUpdates: RawLatestReportUpdate[];
}

export interface RawLatestReportUpdate {
  serverId: string;
  reportTs?: number;
  samples: RawSample[];
}

export interface RawSample {
  ts?: number;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
}

export interface RawSiteConfig {
  version: string;
  last_workers_version: string;
  last_agent_version: string;
  is_public: boolean;
  authorization: boolean;
  turnstile_enabled: boolean;
  turnstile_login_enabled: boolean;
  turnstile_site_key: string;
  site_title: string;
  preferred_theme: string;
  theme_options: Record<string, unknown>;
  verified: boolean;
  turnstile_verified: string;
  long_history_points: number;
  frontend_ws_timeout_minutes: number;
  /** 站长给四条线路起的名字；缺席就用默认名。 */
  custom_ct_name: string;
  custom_cu_name: string;
  custom_cm_name: string;
  custom_bd_name: string;
  /** 首页延迟窗口口径（新版后端才有）。 */
  latency_window?: { points?: number; hours?: number };
  /** 部分后端版本会把 sysConfig 一并塞进 /api/config。 */
  sysConfig?: RawSysConfig;
}

export interface RawHistoryRow {
  timestamp: number;
  cpu: number;
  ram_total: number;
  ram_used: number;
  swap_total: number;
  swap_used: number;
  disk_total: number;
  disk_used: number;
  processes: number;
  net_in_speed: number;
  net_out_speed: number;
  tcp_conn: number;
  udp_conn: number;
  ping_ct: number | null;
  ping_cu: number | null;
  ping_cm: number | null;
  ping_bd: number | null;
  loss_ct: number | null;
  loss_cu: number | null;
  loss_cm: number | null;
  loss_bd: number | null;
  load_avg: string;
  kernel_version: string;
}

/* ------------------------------------------------------------------ *
 * 展示模型
 * ------------------------------------------------------------------ */

/** 探测线路 key。顺序即线路顺序。 */
export const CARRIER_KEYS = ["ct", "cu", "cm", "bd"] as const;
export type CarrierKey = (typeof CARRIER_KEYS)[number];

export const DEFAULT_CARRIER_NAMES: Record<CarrierKey, string> = {
  ct: "电信",
  cu: "联通",
  cm: "移动",
  bd: "BD",
};

export type CarrierNames = Record<CarrierKey, string>;

export interface NodePing {
  ping: Record<CarrierKey, number | null>;
  loss: Record<CarrierKey, number | null>;
  /** 后端下发的一小时窗口（可能缺席）。 */
  window: RawLatencyPoint[] | null;
  lossWindow: RawLatencyPoint[] | null;
}

export interface NodeMetrics {
  online: boolean;
  cpuPct: number;
  ramUsed: number;
  ramTotal: number;
  ramPct: number;
  swapUsed: number;
  swapTotal: number;
  diskUsed: number;
  diskTotal: number;
  diskPct: number;
  netUp: number;
  netDown: number;
  /** 探针生命周期累计（字节）。 */
  trafficUpTotal: number;
  trafficDownTotal: number;
  /** 本计费周期累计（字节）。 */
  trafficUpMonth: number;
  trafficDownMonth: number;
  uptime: number;
  load1: number;
  load5: number;
  load15: number;
  process: number;
  connectionsTcp: number;
  connectionsUdp: number;
  updatedAt: number;
  reportAt: number;
}

export interface Node {
  id: string;
  name: string;
  group: string;
  region: string;
  hidden: boolean;
  os: string;
  arch: string;
  kernel: string;
  cpuName: string;
  cpuCores: number;
  memTotal: number;
  swapTotal: number;
  diskTotal: number;
  agentVersion: string;
  sortOrder: number;
  tags: string;
  price: number;
  currency: string;
  billingCycle: string;
  autoRenewal: boolean;
  expireDate: string;
  /** 流量配额（字节），0 表示不限。 */
  trafficLimit: number;
  trafficCalcType: string;
  trafficResetDay: number;
  metrics: NodeMetrics;
  ping: NodePing;
}

/** 站点配置的展示模型。 */
export interface PublicConfig {
  siteTitle: string;
  version: string;
  isPublic: boolean;
  /** 这次请求带的令牌后端认不认 → 登录态由它推导。 */
  authorization: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  verified: boolean;
  themeOptions: Record<string, unknown>;
  frontendWsTimeoutMinutes: number;
  carrierNames: CarrierNames;
  sysConfig: RawSysConfig;
}

export interface OverviewStats {
  total: number;
  online: number;
  offline: number;
  globalSpeedIn: number;
  globalSpeedOut: number;
}
