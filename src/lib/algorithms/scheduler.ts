// 30 分钟调度器核心纯函数 — 对应 docs/ALGORITHM.md 第 2 节
import { DEFAULT_CONFIG } from "@/lib/config";

export interface PriorityInput {
  examWeight: number; // 0.5-1
  masteryScore: number; // 0-100
  repairability: number; // 0.5-1
  reviewUrgency: number; // 0.5-2
  hintDependency: number; // 0-100
  prereqSatisfied: boolean;
}

/** Priority = ExamWeight × KnowledgeGap × Repairability × ReviewUrgency × ConfidenceFactor */
export function computePriority(input: PriorityInput): number {
  const gap = 1 - Math.min(100, Math.max(0, input.masteryScore)) / 100;
  const confidenceFactor = 1 - input.hintDependency / 200;
  let p =
    input.examWeight *
    Math.max(0, gap) *
    input.repairability *
    input.reviewUrgency *
    Math.max(0.1, confidenceFactor);
  if (!input.prereqSatisfied) p *= DEFAULT_CONFIG.hardPrereqMultiplier;
  return Math.round(p * 10000) / 10000;
}

/** 六段总时长校验：是否在 25-35 分钟内 */
export function isBudgetValid(minutesBySegment: Record<string, number>): boolean {
  const total = Object.values(minutesBySegment).reduce((a, b) => a + b, 0);
  return total >= DEFAULT_CONFIG.planTotalMin && total <= DEFAULT_CONFIG.planTotalMax;
}

/** 默认六段时长 */
export function defaultBudget(): Record<string, number> {
  return { ...DEFAULT_CONFIG.planBudget };
}

/** 主科交替：周一三五物理，周二四六化学，周日周测/薄弱 */
export function primarySubjectFor(date: Date): "PH" | "CH" | "WEEKLY" {
  switch (date.getDay()) {
    case 1:
    case 3:
    case 5:
      return "PH";
    case 2:
    case 4:
    case 6:
      return "CH";
    default:
      return "WEEKLY";
  }
}

/** 近 3 天首次独立正确率对应的难度系数：低降难、高增变式 */
export function difficultyDecision(recentIndependentAccuracy: number): "DECREASE" | "KEEP" | "INCREASE" {
  const cfg = DEFAULT_CONFIG;
  if (recentIndependentAccuracy < cfg.lowIndependentThreshold * 100) return "DECREASE";
  if (recentIndependentAccuracy > cfg.highIndependentThreshold * 100) return "INCREASE";
  return "KEEP";
}
