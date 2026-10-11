/**
 * 宽松取值工具。
 *
 * CF-Server-Monitor 的字段是「字符串 / 数字 / 布尔混用、缺失即空」的风格
 * （例如 `is_hidden` 是 `'0'|'1'`，`price` 是字符串），而且新旧版本后端会增删字段。
 * 这里全部按「拿不到就给默认值」处理，绝不让某个字段的缺失把整页打崩。
 */

export function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "boolean") return value ? "1" : "0";
  return fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** 可能为空的数值：拿不到返回 null（用于 ping/loss 这类「有值才画」的字段）。 */
export function asNumberOrNull(value: unknown): number | null {
  if (value == null || value === false) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** 后端的 `'0'|'1'` 字符串布尔。 */
export function asBoolFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asObjectArray(value: unknown): Record<string, unknown>[] {
  return asArray(value).filter(isRecord);
}

/** 字符串 id 归一：后端有时给数字、有时给字符串。 */
export function asId(value: unknown): string {
  return asString(value);
}
