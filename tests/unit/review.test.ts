import { describe, it, expect } from "vitest";
import { applyReview, INITIAL_REVIEW, type ReviewState } from "../../src/lib/algorithms/review";

describe("间隔复测算法", () => {
  it("独立正确逐阶段升级：1→3→7→14→30", () => {
    let s: ReviewState = { ...INITIAL_REVIEW };
    const days: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = applyReview(s, "FIRST_TRY_CORRECT");
      s = r;
      days.push(r.daysUntilReview);
    }
    expect(days).toEqual([3, 7, 14, 30, 30]);
  });

  it("Hint 2 正确缩短复测周期", () => {
    const s: ReviewState = { ...INITIAL_REVIEW, stage: 3 }; // 当前 14 天阶段
    const r = applyReview(s, "CORRECT_AFTER_HINT_2");
    expect(r.daysUntilReview).toBeLessThan(14);
    expect(r.boost).toBe(true);
  });

  it("错误次日复测", () => {
    const s = applyReview({ ...INITIAL_REVIEW }, "WRONG");
    expect(s.daysUntilReview).toBe(1);
    expect(s.consecutiveFails).toBe(1);
  });

  it("连续两次失败回退到 remedial + stage 0", () => {
    let s = { ...INITIAL_REVIEW, stage: 2 };
    s = applyReview(s, "WRONG");
    s = applyReview(s, "WRONG");
    expect(s.stage).toBe(0);
    expect(s.remedial).toBe(true);
  });

  it("Hint 1 正确进入下一阶段但提高优先级", () => {
    const s = applyReview({ ...INITIAL_REVIEW }, "CORRECT_AFTER_HINT_1");
    expect(s.stage).toBe(1);
    expect(s.boost).toBe(true);
  });
});
