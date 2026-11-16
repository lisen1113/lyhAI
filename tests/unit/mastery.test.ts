import { describe, it, expect } from "vitest";
import {
  applyAttempt,
  confidenceWeight,
  outcomeDelta,
  statusFromScore,
  INITIAL_MASTERY,
} from "../../src/lib/algorithms/mastery";

describe("Mastery 算法", () => {
  it("delta 映射：首次独立正确 > 提示后正确 > 错误", () => {
    expect(outcomeDelta("FIRST_TRY_CORRECT")).toBeGreaterThan(outcomeDelta("CORRECT_AFTER_HINT_1"));
    expect(outcomeDelta("CORRECT_AFTER_HINT_1")).toBeGreaterThan(outcomeDelta("CORRECT_AFTER_HINT_3"));
    expect(outcomeDelta("WRONG")).toBeLessThan(0);
    expect(outcomeDelta("CORRECT_AFTER_SOLUTION")).toBeGreaterThanOrEqual(0);
    expect(outcomeDelta("CORRECT_AFTER_SOLUTION")).toBeLessThan(outcomeDelta("CORRECT_AFTER_HINT_3"));
  });

  it("置信权重随样本增长并最终封顶为 1", () => {
    expect(confidenceWeight(0)).toBeLessThan(1);
    expect(confidenceWeight(0)).toBeGreaterThan(0.5); // 初期就要有明显反馈
    expect(confidenceWeight(100)).toBe(1);
  });

  it("masteryScore 被 clamp 在 [0,100]", () => {
    let s = { ...INITIAL_MASTERY, masteryScore: 98, sampleCount: 10 };
    s = applyAttempt(s, "FIRST_TRY_CORRECT");
    expect(s.masteryScore).toBeLessThanOrEqual(100);

    let t = { ...INITIAL_MASTERY, masteryScore: 3, sampleCount: 10 };
    t = applyAttempt(t, "WRONG");
    expect(t.masteryScore).toBeGreaterThanOrEqual(0);
  });

  it("独立率与提示依赖分别统计，提示后做对不算独立", () => {
    let s = { ...INITIAL_MASTERY };
    s = applyAttempt(s, "FIRST_TRY_CORRECT");
    s = applyAttempt(s, "CORRECT_AFTER_HINT_1");
    expect(s.independentAccuracy).toBe(50);
    expect(s.hintDependency).toBe(50);
  });

  it("独立率过低时触发封顶标记", () => {
    const state = { ...INITIAL_MASTERY, masteryScore: 70, sampleCount: 20,
      recentOutcomes: Array(20).fill("CORRECT_AFTER_HINT_2") as Array<"CORRECT_AFTER_HINT_2"> };
    const result = applyAttempt(state, "CORRECT_AFTER_HINT_2");
    expect(result.cappedByIndependent).toBe(true);
  });

  it("状态分档正确", () => {
    expect(statusFromScore(0)).toBe("NOT_STARTED");
    expect(statusFromScore(25)).toBe("INTRO");
    expect(statusFromScore(50)).toBe("LEARNING");
    expect(statusFromScore(70)).toBe("BASIC");
    expect(statusFromScore(80)).toBe("PROFICIENT");
    expect(statusFromScore(95)).toBe("STABLE");
  });
});
