// 掌握度算法纯函数 — 对应 docs/ALGORITHM.md 第 1 节
// 无副作用、无 DB 依赖，可单测。
import { DEFAULT_CONFIG } from "@/lib/config";

export type AttemptOutcome = keyof typeof DEFAULT_CONFIG.delta;

export interface MasteryState {
  masteryScore: number;
  confidenceScore: number;
  independentAccuracy: number;
  hintDependency: number;
  sampleCount: number;
  recentOutcomes: AttemptOutcome[];
}

export interface MasteryUpdateResult extends MasteryState {
  cappedByIndependent: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 计算置信权重：样本越多越接近 1 */
export function confidenceWeight(sampleCount: number): number {
  const { confidenceK, minConfidenceWeight } = DEFAULT_CONFIG;
  return clamp(sampleCount / confidenceK, minConfidenceWeight, 1);
}

/** 单次作答后的 delta */
export function outcomeDelta(outcome: AttemptOutcome): number {
  return DEFAULT_CONFIG.delta[outcome];
}

/**
 * 应用一次作答，返回新的掌握度状态。
 * - masteryScore 按 delta × 置信权重更新并 clamp 到 [0,100]
 * - independentAccuracy / hintDependency 基于滑动窗口
 * - 若独立率过低，status 层面封顶（此处返回 cappedByIndependent 供上层决定 status）
 */
export function applyAttempt(state: MasteryState, outcome: AttemptOutcome): MasteryUpdateResult {
  const cfg = DEFAULT_CONFIG;
  const weight = confidenceWeight(state.sampleCount);
  const delta = outcomeDelta(outcome);
  const masteryScore = clamp(state.masteryScore + delta * weight, 0, 100);

  const window = [...state.recentOutcomes, outcome].slice(-cfg.independentWindow);
  const independentCount = window.filter(
    (o) => o === "FIRST_TRY_CORRECT"
  ).length;
  const hintCount = window.filter(
    (o) => o === "CORRECT_AFTER_HINT_1" || o === "CORRECT_AFTER_HINT_2" || o === "CORRECT_AFTER_HINT_3"
  ).length;
  const validCount = window.filter((o) => o !== "SKIPPED").length || 1;

  const independentAccuracy = clamp((independentCount / validCount) * 100, 0, 100);
  const hintDependency = clamp((hintCount / validCount) * 100, 0, 100);
  const confidenceScore = clamp(confidenceWeight(window.length) * 100, 0, 100);

  return {
    masteryScore,
    confidenceScore,
    independentAccuracy,
    hintDependency,
    sampleCount: state.sampleCount + 1,
    recentOutcomes: window,
    cappedByIndependent: masteryScore >= 60 && independentAccuracy < 60,
  };
}

/** 分数 → 状态枚举 */
export function statusFromScore(score: number): string {
  for (const t of DEFAULT_CONFIG.statusThresholds) {
    if (score >= t.min) return t.status;
  }
  return "NOT_STARTED";
}

export const INITIAL_MASTERY: MasteryState = {
  masteryScore: 0,
  confidenceScore: 0,
  independentAccuracy: 0,
  hintDependency: 0,
  sampleCount: 0,
  recentOutcomes: [],
};
