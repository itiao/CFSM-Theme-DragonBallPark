/**
 * 本地假数据：`?mock=1` 时启用，手边没有后端也能看界面。
 * 只在开发与截图验收时用，不影响真实数据流。
 */

import type { RawServer, RawSiteConfig } from "@/services/cfsm/types";

export function isMockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search);
  if (search.has("mock")) return true;
  return window.location.hash.includes("mock");
}

const REGIONS = ["HK", "JP", "US", "SG", "TW", "DE", "CN", "KR", "CL"];
const NAMES = [
  "GoMami HKG Turin",
  "Sharon HK",
  "Sharon SG",
  "MK Rocket",
  "Ciallo",
  "FXTRANSIT",
  "Panstar",
  "Yunyoo NTT",
  "NewNB",
  "Breadcloud",
  "DataWave HGC",
  "Datanode Pro",
  "Danyun",
  "DMIT",
  "Taipei101 LA",
  "Taipei101 TW",
  "BitsFlow HK",
  "Hosuyun HK",
  "Aether LA",
  "SparkVM SZHK",
];

/** 稳定的 0–1 伪随机（同一个 id 每次结果一致，便于截图对比）。 */
function pseudo(seed: number, mod: number): number {
  return (Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % mod) / mod;
}

export function buildMockServers(): RawServer[] {
  const now = Date.now();
  return NAMES.map((name, index) => {
    const id = index + 1;
    const online = index % 7 !== 3;
    const cores = 1 + (index % 4);
    const ramTotal = (1 + (index % 5)) * 2048;
    const diskTotal = 40 * 1024;
    const seed = pseudo(id, 1000);

    return {
      id: String(id),
      name,
      server_group: "",
      tags: "",
      price: String(5 + (index % 9) * 3.5),
      billing_cycle: ["monthly", "quarterly", "annually"][index % 3]!,
      auto_renewal: index % 2 ? "1" : "0",
      currency: "USD",
      expire_date: new Date(now + (5 + index * 9) * 86_400_000).toISOString().slice(0, 10),
      traffic_limit: String(500 + (index % 4) * 500),
      traffic_calc_type: ["sum", "up", "down", "max"][index % 4]!,
      reset_day: 1,
      report_interval: 60,
      is_hidden: "0",
      sort_order: id,
      cpu: seed * 60,
      load_avg: `${(seed * 2).toFixed(2)} ${(seed * 1.6).toFixed(2)} ${(seed * 1.2).toFixed(2)}`,
      net_in_speed: online ? seed * 900_000 : 0,
      net_out_speed: online ? seed * 420_000 : 0,
      net_rx: seed * 1e10,
      net_tx: seed * 8e9,
      net_rx_monthly: seed * 3e9,
      net_tx_monthly: seed * 2e9,
      processes: 80 + Math.floor(seed * 200),
      tcp_conn: 20 + Math.floor(seed * 200),
      udp_conn: 5 + Math.floor(seed * 60),
      ping_ct: 20 + seed * 180,
      ping_cu: 22 + seed * 160,
      ping_cm: 15 + seed * 120,
      ping_bd: 30 + seed * 90,
      loss_ct: seed > 0.8 ? 6 : 0,
      loss_cu: seed > 0.85 ? 12 : 0,
      loss_cm: 0,
      loss_bd: seed > 0.9 ? 3 : 0,
      ram_total: ramTotal,
      ram_used: online ? ramTotal * (0.25 + seed * 0.5) : ramTotal * 0.3,
      swap_total: 2048,
      swap_used: 0,
      disk_total: diskTotal,
      disk_used: diskTotal * (0.1 + seed * 0.6),
      cpu_cores: cores,
      cpu_info: ["AMD EPYC 9575F 64-Core Processor", "Intel Xeon E5-2690 v4", "AMD Ryzen 9 7950X"][index % 3]!,
      arch: "x86_64",
      os: "Debian GNU/Linux 13 (trixie)",
      kernel_version: "6.12.111+deb13-amd64",
      region: REGIONS[index % REGIONS.length]!,
      ip_v4: "1",
      ip_v6: "1",
      boot_time: String(now - (online ? seed * 30 * 86_400_000 + 3600_000 : 0)),
      agent_version: "1.2.0",
      last_updated: online ? now - 30_000 : now - 3_600_000,
      timestamp: now,
    };
  });
}

export function buildMockConfig(): RawSiteConfig {
  return {
    version: "2.8.5",
    last_workers_version: "2.8.5",
    last_agent_version: "1.2.0",
    is_public: true,
    authorization: false,
    turnstile_enabled: false,
    turnstile_login_enabled: false,
    turnstile_site_key: "",
    site_title: "龙珠公园",
    preferred_theme: "auto",
    theme_options: {},
    verified: true,
    turnstile_verified: "",
    long_history_points: 120,
    frontend_ws_timeout_minutes: 0,
    custom_ct_name: "",
    custom_cu_name: "",
    custom_cm_name: "",
    custom_bd_name: "",
  };
}

export function buildMockHistory(hours: number): { data: Array<Record<string, number | string | null>> } {
  const now = Date.now();
  const points = Math.max(20, Math.min(240, Math.round(hours * 30)));
  const step = (hours * 3600_000) / points;
  const rows: Array<Record<string, number | string | null>> = [];
  for (let i = 0; i < points; i += 1) {
    const time = now - (points - i) * step;
    const wave = Math.sin(i / 6);
    rows.push({
      timestamp: time,
      cpu: 20 + wave * 15 + Math.random() * 8,
      ram_total: 4096,
      ram_used: 1800 + wave * 300,
      swap_total: 2048,
      swap_used: 0,
      disk_total: 40960,
      disk_used: 12000 + i * 0.6,
      processes: 140,
      net_in_speed: 400_000 + Math.random() * 900_000,
      net_out_speed: 180_000 + Math.random() * 400_000,
      tcp_conn: 60,
      udp_conn: 20,
      ping_ct: 30 + wave * 12 + Math.random() * 6,
      ping_cu: 34 + wave * 14 + Math.random() * 6,
      ping_cm: 26 + wave * 9 + Math.random() * 5,
      ping_bd: 42 + wave * 10 + Math.random() * 7,
      loss_ct: Math.random() > 0.9 ? 8 : 0,
      loss_cu: 0,
      loss_cm: 0,
      loss_bd: 0,
      load_avg: "0.42 0.35 0.30",
      kernel_version: "6.12.111+deb13-amd64",
    });
  }
  return { data: rows };
}
