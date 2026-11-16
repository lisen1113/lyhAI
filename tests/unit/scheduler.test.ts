import { describe, it, expect } from "vitest";
import {
  computePriority,
  isBudgetValid,
  defaultBudget,
  primarySubjectFor,
  difficultyDecision,
} from "../../src/lib/algorithms/scheduler";

describe("30 分钟调度器", () => {
  it("默认六段时长总和为 30", () => {
    const b = defaultBudget();
    const total = Object.values(b).reduce((a, c) => a + c, 0);
    expect(total).toBe(30);
    expect(isBudgetValid(b)).toBe(true);
  });

  it("总时长超出 35 分钟时判定非法", () => {
    expect(isBudgetValid({ ...defaultBudget(), PRACTICE: 30 })).toBe(false);
  });

  it("优先级：缺口越大优先级越高", () => {
    const base = { examWeight: 1, repairability: 1, reviewUrgency: 1, hintDependency: 0, prereqSatisfied: true };
    expect(computePriority({ ...base, masteryScore: 10 })).toBeGreaterThan(
      computePriority({ ...base, masteryScore: 90 })
    );
  });

  it("硬前置未满足时优先级大幅降低", () => {
    const base = { examWeight: 1, masteryScore: 20, repairability: 1, reviewUrgency: 1, hintDependency: 0 };
    const ok = computePriority({ ...base, prereqSatisfied: true });
    const blocked = computePriority({ ...base, prereqSatisfied: false });
    expect(blocked).toBeLessThan(ok);
  });

  it("主科交替：周一三五物理，周二四六化学，周日周测", () => {
    // 2026-11-16 是周一
    expect(primarySubjectFor(new Date("2026-11-16T12:00:00Z"))).toBe("PH");
    expect(primarySubjectFor(new Date("2026-11-17T12:00:00Z"))).toBe("CH");
    expect(primarySubjectFor(new Date("2026-11-22T12:00:00Z"))).toBe("WEEKLY");
  });

  it("独立正确率驱动难度调节", () => {
    expect(difficultyDecision(40)).toBe("DECREASE");
    expect(difficultyDecision(70)).toBe("KEEP");
    expect(difficultyDecision(92)).toBe("INCREASE");
  });
});
