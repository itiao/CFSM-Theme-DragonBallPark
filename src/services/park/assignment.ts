/**
 * 节点 → 角色的分配，以及「进化」阶段计算。
 * 规则与目标站一致，分配结果持久化，刷新页面不会换角色。
 */

import type { Node } from "@/services/cfsm/types";
import { isFavorite, type Roster, type RosterFamily } from "./roster";

const ASSIGN_KEY = "dragon-park.assign.v1";
const STAGE_KEY = "dragon-park.stage.v1";

/** FNV-1a 32 位哈希 —— 目标站用的同一个函数，保证同一节点每次都落到同一个角色。 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式，忽略。
  }
}

/** 记忆化的分配表：`节点id → 家族id`。 */
export function readAssignments(): Record<string, string> {
  return readJson<Record<string, string>>(ASSIGN_KEY, {});
}

export function readStages(): Record<string, number> {
  return readJson<Record<string, number>>(STAGE_KEY, {});
}

export function writeStages(stages: Record<string, number>): void {
  writeJson(STAGE_KEY, stages);
}

/**
 * 为一批节点挑角色家族。
 *
 * 1. 已经分配过的沿用（稳定）
 * 2. 否则从「未被占用」的主角家族里随机取
 * 3. 主角用完了 → 从其余家族里随机取
 * 4. 再没有 → 按节点 id 的哈希确定性兜底
 */
export function assignFamilies(
  roster: Roster,
  nodes: Array<Pick<Node, "id">>,
): Map<string, RosterFamily> {
  const result = new Map<string, RosterFamily>();
  if (roster.families.length === 0) return result;

  const stored = readAssignments();
  const taken = new Set<string>();
  const byId = new Map(roster.families.map((family) => [family.id, family]));

  const favorites = roster.families.filter((family) => isFavorite(family.id));
  const rest = roster.families
    .filter((family) => !isFavorite(family.id))
    .sort((a, b) => hashString(a.id) - hashString(b.id));

  let dirty = false;

  for (const node of nodes) {
    const remembered = stored[node.id];
    if (remembered && byId.has(remembered) && !taken.has(remembered)) {
      const family = byId.get(remembered)!;
      result.set(node.id, family);
      taken.add(family.id);
      continue;
    }

    const freeFavorites = favorites.filter((family) => !taken.has(family.id));
    const freeRest = rest.filter((family) => !taken.has(family.id));
    const pool = freeFavorites.length > 0 ? freeFavorites : freeRest;

    let family: RosterFamily;
    if (pool.length > 0) {
      family = pool[Math.floor(Math.random() * pool.length)];
    } else {
      family = roster.families[hashString(node.id) % roster.families.length];
    }

    result.set(node.id, family);
    taken.add(family.id);
    stored[node.id] = family.id;
    dirty = true;
  }

  if (dirty) writeJson(ASSIGN_KEY, stored);
  return result;
}

/** 野生装饰角色用的确定性家族（负 id）。 */
export function wildFamily(roster: Roster, index: number): RosterFamily | null {
  const pool = roster.families.filter((family) => !isFavorite(family.id));
  if (pool.length === 0) return null;
  return pool[hashString(`w${index}`) % pool.length];
}

/**
 * 进化阶段：在线每满 `evolutionDays` 天进化一阶，封顶为该家族的形态数 − 1。
 * 无节点信息（野生角色）时沿用记忆阶段。
 */
export function evolutionStage(
  family: RosterFamily,
  node: Pick<Node, "metrics"> | null,
  remembered: number,
  evolutionDays: number,
): number {
  const max = family.forms.length - 1;
  if (max <= 0) return 0;
  if (!node) return Math.min(Math.max(0, remembered), max);
  const uptime = node.metrics.uptime;
  const days = Math.max(1, evolutionDays);
  const stage =
    uptime == null || uptime <= 0
      ? remembered
      : Math.floor(uptime / (days * 86400));
  return Math.min(Math.max(0, stage), max);
}
