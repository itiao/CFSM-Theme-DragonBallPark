/**
 * 「健康分」—— 替代目标站的第三方 IP 信誉分。
 *
 * CF-Server-Monitor 不提供任何 IP 信誉数据（目标站是查 `ip.net.coffee`），
 * 这里改用后端本来就有的**延迟 + 丢包**自己算一个 0–100 的分：
 *
 *   延迟分 = clamp(100 - log10(max(延迟, 10) / 10) × 45, 0, 100)
 *             → 10ms=100、100ms=55、1000ms=10，符合「延迟越差掉分越快」的直觉
 *   丢包分 = 100 - 丢包率(%)
 *   节点分 = 各条线路 (0.6 × 延迟分 + 0.4 × 丢包分) 的均值
 *   站点分 = 在线节点节点分的均值
 *
 * 离线节点不参与（否则一台关机就把全站分数拖垮），但会在返回里单独计数。
 */

import { CARRIER_KEYS, type Node } from "./cfsm/types";

export interface HealthScore {
  /** 站点总分 0–100；无数据时为 null。 */
  score: number | null;
  /** 参与计算的在线节点数。 */
  sampled: number;
  /** 有数据的线路测量数。 */
  measurements: number;
  grade: HealthGrade;
}

export type HealthGrade = "excellent" | "good" | "fair" | "poor" | "unknown";

export const HEALTH_GRADE_LABEL: Record<HealthGrade, string> = {
  excellent: "健康优秀",
  good: "健康良好",
  fair: "健康一般",
  poor: "健康较差",
  unknown: "健康未知",
};

function latencyScore(latencyMs: number): number {
  const value = Math.max(latencyMs, 10);
  const score = 100 - Math.log10(value / 10) * 45;
  return clamp(score, 0, 100);
}

function lossScore(lossPct: number): number {
  return clamp(100 - lossPct, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function gradeOf(score: number | null): HealthGrade {
  if (score == null || !Number.isFinite(score)) return "unknown";
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 45) return "fair";
  return "poor";
}

/** 单台节点的健康分；没有任何线路数据时返回 null。 */
export function nodeHealth(node: Node): number | null {
  if (!node.metrics.online) return null;
  let sum = 0;
  let count = 0;
  for (const key of CARRIER_KEYS) {
    const latency = node.ping.ping[key];
    const loss = node.ping.loss[key];
    if (latency == null && loss == null) continue;
    const lat = latency == null ? 50 : latencyScore(latency);
    const los = loss == null ? 100 : lossScore(loss);
    sum += 0.6 * lat + 0.4 * los;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}

export function computeHealthScore(nodes: Node[]): HealthScore {
  let sum = 0;
  let sampled = 0;
  let measurements = 0;

  for (const node of nodes) {
    if (!node.metrics.online) continue;
    const score = nodeHealth(node);
    if (score == null) continue;
    sum += score;
    sampled += 1;
    for (const key of CARRIER_KEYS) {
      if (node.ping.ping[key] != null || node.ping.loss[key] != null) measurements += 1;
    }
  }

  const score = sampled === 0 ? null : sum / sampled;
  return { score, sampled, measurements, grade: gradeOf(score) };
}

/** 单条线路的健康分，用于详情页逐条展示。 */
export function carrierHealth(node: Node): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const key of CARRIER_KEYS) {
    const latency = node.ping.ping[key];
    const loss = node.ping.loss[key];
    if (latency == null && loss == null) {
      result[key] = null;
      continue;
    }
    const lat = latency == null ? 50 : latencyScore(latency);
    const los = loss == null ? 100 : lossScore(loss);
    result[key] = 0.6 * lat + 0.4 * los;
  }
  return result;
}
