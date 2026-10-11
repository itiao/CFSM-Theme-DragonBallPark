/**
 * 主题设置。
 *
 * 默认值取自目标站（Exia Monitor）的设置对象。
 * 存储策略沿用官方建议：**登录站长**改动写后端 `POST /api/theme_options`（所有访客共享），
 * 访客的改动只留在本机 localStorage。
 */

import { saveThemeOptions } from "./cfsm/api";

const STORAGE_KEY = "dragon-park.settings.v1";

export interface ThemeSettings {
  appearance: "system" | "light" | "dark";
  /** 首页形态：3D 公园 / 纯列表。 */
  view: "park" | "list";
  /** 公园里额外的「野生」装饰角色数量。 */
  parkExtra: number;
  /** 在线满多少天进化一阶。 */
  evolutionDays: number;
  /** 卡片上是否显示价格。 */
  showPrice: boolean;
  /** 降低动态效果（关掉角色动画）。 */
  reduceMotion: boolean;
  /** 玻璃拟态模糊半径（px）。 */
  glassBlur: number;
  /** 公园背景图 URL。 */
  backgroundUrl: string;
  /**
   * 角色模型与名录的托管前缀。
   * 留空 = 跟主题同源（`/models/`、`/roster.json`）；
   * 模型有 40MB+，嫌仓库太重时可以挪到别处，把前缀填这里。
   */
  assetBase: string;
  /** 顶栏是否显示健康分。 */
  showScore: boolean;
}

export const DEFAULT_SETTINGS: ThemeSettings = {
  appearance: "system",
  view: "park",
  parkExtra: 0,
  evolutionDays: 30,
  showPrice: false,
  reduceMotion: false,
  glassBlur: 14,
  backgroundUrl: "/bg-kame-iso.jpg",
  assetBase: "",
  showScore: true,
};

type Listener = () => void;

const listeners = new Set<Listener>();
let cached: ThemeSettings = read();
let syncTimer: number | null = null;

function read(): ThemeSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    return normalize(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalize(input: Partial<ThemeSettings> | Record<string, unknown>): ThemeSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(input as Partial<ThemeSettings>) };
  return {
    appearance:
      merged.appearance === "light" || merged.appearance === "dark" ? merged.appearance : "system",
    view: merged.view === "list" ? "list" : "park",
    parkExtra: clampNumber(merged.parkExtra, 0, 12, 0),
    evolutionDays: clampNumber(merged.evolutionDays, 1, 3650, 30),
    showPrice: Boolean(merged.showPrice),
    reduceMotion: Boolean(merged.reduceMotion),
    glassBlur: clampNumber(merged.glassBlur, 0, 40, 14),
    backgroundUrl: typeof merged.backgroundUrl === "string" ? merged.backgroundUrl : DEFAULT_SETTINGS.backgroundUrl,
    assetBase: typeof merged.assetBase === "string" ? merged.assetBase.trim() : "",
    showScore: merged.showScore !== false,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function getSettings(): ThemeSettings {
  return cached;
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 用后端 `theme_options` 里的值覆盖本地默认（后端有的项优先，本地没改过的才吃）。 */
export function applyBackendOptions(options: Record<string, unknown>, loggedIn: boolean): void {
  const hasLocal = Boolean(safeGetItem(STORAGE_KEY));
  // 访客本机改过就以本机为准；没改过则跟随后端。
  if (hasLocal && !loggedIn) return;
  const next = normalize({ ...DEFAULT_SETTINGS, ...(options as Partial<ThemeSettings>) });
  cached = next;
  persist();
  emit();
}

export function updateSettings(patch: Partial<ThemeSettings>, syncToBackend: boolean): void {
  cached = normalize({ ...cached, ...patch });
  persist();
  emit();
  if (syncToBackend) scheduleSync();
}

export function resetSettings(): void {
  cached = { ...DEFAULT_SETTINGS };
  persist();
  emit();
}

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // 隐私模式，忽略。
  }
  applyGlassBlur();
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** 玻璃模糊半径做成 CSS 变量，改设置立刻生效。 */
export function applyGlassBlur(): void {
  document.documentElement.style.setProperty("--glass-blur", `${cached.glassBlur}px`);
}

function scheduleSync(): void {
  if (syncTimer != null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    // 只更新主题自己的配置，不碰站点外观设置；失败就留在本机，下次再发。
    void saveThemeOptions({ ...cached }).catch(() => undefined);
  }, 1_000);
}
