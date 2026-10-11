/**
 * CF-Server-Monitor 公开接口的调用封装。
 *
 * **只允许这 6 个**（官方规范白名单），不要新增任何其它路径：
 *   GET  /api/config
 *   GET  /api/servers
 *   GET  /api/server?id=
 *   GET  /api/history/all?id=&hours=
 *   GET  /api/ws
 *   POST /api/theme_options
 */

import { buildMockConfig, buildMockHistory, buildMockServers, isMockEnabled } from "@/dev/mockApi";
import { request, requestAllBases } from "./http";
import { mapHistoryResponse, mapServer, mapSiteConfig, type HistoryMapped } from "./mappers";
import type { Node, PublicConfig, RawServer } from "./types";

/** 详情页允许的时间档位（官方规范限定）。 */
export const HISTORY_HOURS = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168] as const;
export type HistoryHours = (typeof HISTORY_HOURS)[number];

/** 默认档位：10 分钟。 */
export const DEFAULT_HISTORY_HOURS: HistoryHours = 0.167;

/** 全页面生命周期只查一次，结果缓存在内存。 */
let configPromise: Promise<PublicConfig> | null = null;

export function getConfig(force = false): Promise<PublicConfig> {
  if (isMockEnabled()) return Promise.resolve(mapSiteConfig(buildMockConfig()));
  if (!configPromise || force) {
    configPromise = requestAllBases<unknown>("/api/config")
      .then((responses) => {
        // 多后端时以第一个能拿到的为准（站点级配置各后端一致）。
        const payload = responses[0] ?? {};
        return mapSiteConfig(payload);
      })
      .catch((error) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

export function invalidateConfig(): void {
  configPromise = null;
}

/**
 * 首页首次进入查一次；之后刷新全走 WebSocket。
 *
 * 返回**原始结构**，由 store 负责合并与映射 —— 避免「映射成展示模型再转回原始结构」
 * 这种会丢字段的往返。
 */
export async function getServers(): Promise<RawServer[]> {
  if (isMockEnabled()) return buildMockServers();
  const responses = await requestAllBases<unknown>("/api/servers");
  const merged: RawServer[] = [];

  for (const payload of responses) {
    const record = (payload ?? {}) as Record<string, unknown>;
    const servers = Array.isArray(record.servers) ? (record.servers as RawServer[]) : [];
    merged.push(...servers);
  }

  // 同一台节点被多个后端返回时以先出现的为准（多站部署一般不会重叠）。
  const unique = new Map<string, RawServer>();
  for (const server of merged) {
    const id = String(server?.id ?? "");
    if (!id || unique.has(id)) continue;
    unique.set(id, server);
  }
  return [...unique.values()];
}

/** 直接打开详情页时拿那一台的当前指标。 */
export async function getServer(id: string): Promise<Node | null> {
  if (isMockEnabled()) {
    const found = buildMockServers().find((server) => String(server.id) === id);
    return found ? mapServer(found) : null;
  }
  const responses = await requestAllBases<unknown>(`/api/server?id=${encodeURIComponent(id)}`);
  for (const payload of responses) {
    const record = (payload ?? {}) as Record<string, unknown>;
    const server = (record.server ?? record.data ?? record) as RawServer;
    if (server && (server as { id?: unknown }).id != null) return mapServer(server);
  }
  return null;
}

/** 详情页历史。负载与延迟共用一次查询（历史行里本来就带 ping/loss 字段）。 */
export async function getHistory(id: string, hours: HistoryHours): Promise<HistoryMapped> {
  if (isMockEnabled()) return mapHistoryResponse(buildMockHistory(hours));
  const responses = await requestAllBases<unknown>(
    `/api/history/all?id=${encodeURIComponent(id)}&hours=${hours}`,
  );
  for (const payload of responses) {
    const mapped = mapHistoryResponse(payload);
    if (mapped.load.length > 0) return mapped;
  }
  return { load: [], ping: [] };
}

/** 保存主题自身配置。只更新 theme_options，不碰站点外观设置。 */
export function saveThemeOptions(themeOptions: Record<string, unknown>): Promise<unknown> {
  return request("/api/theme_options", { method: "POST", body: { theme_options: themeOptions } });
}
