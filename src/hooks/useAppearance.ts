import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getSettings, subscribeSettings, updateSettings, type ThemeSettings } from "@/services/settings";

/**
 * 外观（明暗）。来源优先级：
 *   1. 主题设置里的 `appearance`
 *   2. 后台「外观设置 → 默认外观」（`/api/config` 的 `preferred_theme`）
 *   3. 系统偏好
 */

export type Appearance = ThemeSettings["appearance"];

export function resolveAppearance(
  value: Appearance,
  preferred?: string,
): "light" | "dark" {
  if (value === "light" || value === "dark") return value;
  if (preferred === "dark" || preferred === "light") return preferred;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 把解析结果写到 <html data-appearance>，CSS 令牌据此切换。 */
export function applyAppearance(resolved: "light" | "dark"): void {
  document.documentElement.dataset.appearance = resolved;
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b1020" : "#f7f8fb");
}

export function useAppearance(preferred?: string): {
  appearance: Appearance;
  resolved: "light" | "dark";
  setAppearance: (value: Appearance) => void;
  cycle: () => void;
} {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const appearance = settings.appearance;
  const resolved = resolveAppearance(appearance, preferred);

  useEffect(() => {
    applyAppearance(resolved);
  }, [resolved]);

  const setAppearance = useCallback((value: Appearance) => {
    updateSettings({ appearance: value }, false);
  }, []);

  const cycle = useCallback(() => {
    const next: Appearance =
      appearance === "light" ? "dark" : appearance === "dark" ? "system" : "light";
    updateSettings({ appearance: next }, false);
  }, [appearance]);

  return { appearance, resolved, setAppearance, cycle };
}
