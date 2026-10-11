/**
 * 角色名录（roster）。
 *
 * 目标站的 `/roster.json` 指向开源模型库 `fchapoulliep/dragondex3d`。
 * ⚠️ 该库**没有开源许可证**（默认保留所有权利），背景插画亦有作者署名。
 * 自用部署没问题；**若要公开分发主题，必须替换这些素材** —— 只要替换
 * `public/roster.json` 与 `public/models/`，本模块与场景代码都不用改。
 */

import { resolveThemeAsset } from "@/services/themeAssets";

export interface RosterForm {
  id: string;
  name: string;
  dir?: string;
  file: string;
}

export interface RosterFamily {
  id: string;
  name: string;
  forms: RosterForm[];
}

export interface Roster {
  source?: string;
  count?: number;
  families: RosterFamily[];
}

/**
 * 「主角」家族：优先分配给真实节点，保证公园里出现的都是认得出来的角色。
 * 与目标站一致。
 */
export const FAVORITE_FAMILIES = [
  "goku",
  "vegeta",
  "frieza",
  "gohan",
  "piccolo",
  "trunks",
  "broly",
  "cell",
  "jiren",
  "hit",
  "beerus",
  "gogeta",
  "vegito",
  "goku-black",
] as const;

/** 公园里最多摆放的真实节点数（目标站上限 64）。 */
export const MAX_PARK_NODES = 64;

const cache = new Map<string, Promise<Roster>>();

/** 把 roster 里的 `/models/x.glb` 解析成真实可取的地址。 */
export function resolveAssetPath(file: string, assetBase: string): string {
  return resolveThemeAsset(file, assetBase);
}

export function loadRoster(assetBase = ""): Promise<Roster> {
  const existing = cache.get(assetBase);
  if (existing) return existing;

  const promise = fetch(resolveThemeAsset("/roster.json", assetBase), { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`角色名录加载失败（HTTP ${response.status}）`);
      return response.json() as Promise<Roster>;
    })
    .then((data) => ({
      source: data.source,
      count: data.count,
      families: Array.isArray(data.families)
        ? data.families.filter(
            (family) => family && Array.isArray(family.forms) && family.forms.length > 0,
          )
        : [],
    }))
    .catch((error) => {
      cache.delete(assetBase);
      throw error;
    });

  cache.set(assetBase, promise);
  return promise;
}

export function isFavorite(familyId: string): boolean {
  return (FAVORITE_FAMILIES as readonly string[]).includes(familyId);
}
