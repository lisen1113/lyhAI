// 系统默认阈值（配置化基线；生产可写入 SystemConfig 表覆盖）
// 对应 docs/ALGORITHM.md
export const DEFAULT_CONFIG = {
  // Mastery
  // 单次作答对掌握度的影响。
  // 设计约束：一个技能约 5-6 次「独立做对」可到 75+（一节课的量）；
  // 靠提示做对涨幅明显更低，且独立率不足时状态封顶在「基础掌握」。
  delta: {
    FIRST_TRY_CORRECT: 22,
    CORRECT_AFTER_HINT_1: 12,
    CORRECT_AFTER_HINT_2: 7,
    CORRECT_AFTER_HINT_3: 4,
    CORRECT_AFTER_SOLUTION: 2,
    WRONG: -6,
    SKIPPED: -3,
  },
  confidenceK: 4,
  minConfidenceWeight: 0.55,
  independentWindow: 20,
  // 状态分档
  statusThresholds: [
    { min: 90, status: "STABLE" },
    { min: 75, status: "PROFICIENT" },
    { min: 60, status: "BASIC" },
    { min: 40, status: "LEARNING" },
    { min: 20, status: "INTRO" },
    { min: 0, status: "NOT_STARTED" },
  ],
  // 30 分钟计划
  planBudget: {
    WARMUP: 3,
    REVIEW: 5,
    MICRO_LEARN: 5,
    PRACTICE: 12,
    INDEPENDENT: 4,
    SUMMARY: 1,
  },
  planTotalMin: 25,
  planTotalMax: 35,
  // 复测
  reviewIntervals: [1, 3, 7, 14, 30],
  hintShrinkFactor: 0.5,
  failStreakToRemedial: 2,
  // 调度难度调节
  lowIndependentThreshold: 0.55,
  highIndependentThreshold: 0.88,
  hardPrereqMultiplier: 0.3,
  successExperienceMin: 0.65,
  successExperienceMax: 0.8,
} as const;

export type SystemConfig = typeof DEFAULT_CONFIG;
