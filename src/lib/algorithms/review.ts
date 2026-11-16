// 间隔复测算法纯函数 — 对应 docs/ALGORITHM.md 第 3 节
import { DEFAULT_CONFIG } from "@/lib/config";

export type ReviewOutcome =
  | "FIRST_TRY_CORRECT"
  | "CORRECT_AFTER_HINT_1"
  | "CORRECT_AFTER_HINT_2"
  | "CORRECT_AFTER_HINT_3"
  | "WRONG"
  | "SKIPPED";

export interface ReviewState {
  stage: number; // 0-4
  boost: boolean;
  consecutiveFails: number;
  remedial: boolean;
}

export interface ReviewUpdateResult extends ReviewState {
  daysUntilReview: number;
}

/** 根据结果更新复测状态，返回距下次复测天数 */
export function applyReview(
  state: ReviewState,
  outcome: ReviewOutcome,
  now = new Date()
): ReviewUpdateResult {
  const cfg = DEFAULT_CONFIG;
  const maxStage = cfg.reviewIntervals.length - 1;

  let { stage, boost, consecutiveFails, remedial } = state;
  let days: number;

  switch (outcome) {
    case "FIRST_TRY_CORRECT":
      stage = Math.min(stage + 1, maxStage);
      boost = false;
      consecutiveFails = 0;
      remedial = false;
      days = cfg.reviewIntervals[stage];
      break;
    case "CORRECT_AFTER_HINT_1":
      stage = Math.min(stage + 1, maxStage);
      boost = true;
      consecutiveFails = 0;
      days = cfg.reviewIntervals[stage];
      break;
    case "CORRECT_AFTER_HINT_2":
    case "CORRECT_AFTER_HINT_3":
      boost = true;
      consecutiveFails = 0;
      days = Math.max(1, Math.round(cfg.reviewIntervals[stage] * cfg.hintShrinkFactor));
      break;
    case "WRONG":
    case "SKIPPED":
      consecutiveFails += 1;
      days = 1; // 次日复测
      if (consecutiveFails >= cfg.failStreakToRemedial) {
        stage = 0;
        remedial = true;
      }
      break;
  }

  void now; // 实际 nextReviewAt 由调用方 now + days 计算
  return { stage, boost, consecutiveFails, remedial, daysUntilReview: days };
}

export const INITIAL_REVIEW: ReviewState = {
  stage: 0,
  boost: false,
  consecutiveFails: 0,
  remedial: false,
};
