/** 数值格式化。口径尽量贴近目标站（Exabyte 二进制单位 + 中文时长）。 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** 字节 → 人类可读（1024 进制）。`0` 输出 `0B`。 */
export function formatBytes(value: number, fractionDigits?: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0B";
  let index = 0;
  let size = value;
  while (size >= 1024 && index < BYTE_UNITS.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = fractionDigits ?? (size >= 100 ? 0 : size >= 10 ? 1 : 2);
  return `${trimZeros(size.toFixed(digits))}${BYTE_UNITS[index]}`;
}

/** 字节/秒。 */
export function formatSpeed(value: number): string {
  return `${formatBytes(value)}/s`;
}

/** 字节 → GB 数字（用于「1.17 GB / ∞」这种）。 */
export function formatTrafficGb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 GB";
  const gb = value / 1024 ** 3;
  if (gb >= 1024) return `${trimZeros((gb / 1024).toFixed(2))} TB`;
  return `${trimZeros(gb >= 100 ? gb.toFixed(0) : gb.toFixed(2))} GB`;
}

/** 秒 → 「9天 19小时」/「19小时 5分」/「5分 12秒」。 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0分";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  if (minutes > 0) return `${minutes}分 ${secs}秒`;
  return `${secs}秒`;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatLatency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
}

export function formatLoss(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US");
}

/** 计费周期中文化。 */
const BILLING_LABELS: Record<string, string> = {
  monthly: "月付",
  quarterly: "季付",
  semiannually: "半年付",
  annually: "年付",
  yearly: "年付",
  biennially: "两年付",
  triennially: "三年付",
  once: "一次性",
  one_time: "一次性",
};

export function formatBillingCycle(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  return BILLING_LABELS[key] ?? value;
}

export function formatPrice(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) return "免费";
  const symbol = currencySymbol(currency);
  return `${symbol}${trimZeros(value.toFixed(2))}`;
}

export function currencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase();
  switch (code) {
    case "CNY":
    case "RMB":
      return "¥";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "¥";
    case "HKD":
      return "HK$";
    default:
      return code ? `${code} ` : "¥";
  }
}

/** 到期剩余天数（本地日界），null 表示永不到期。 */
export function daysUntil(dateText: string): number | null {
  const value = dateText?.trim();
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : `${value}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diff = parsed.getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** 时钟：HH:MM。 */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
