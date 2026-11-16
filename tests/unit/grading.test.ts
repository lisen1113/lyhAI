import { describe, it, expect } from "vitest";
import { gradeAnswer } from "../../src/lib/services/question";

describe("判分逻辑", () => {
  it("数值题：考虑容差", () => {
    expect(gradeAnswer("NUMERIC", "19.6N", "19.6")).toBe(true);
    expect(gradeAnswer("NUMERIC", "19.6N", "19.7")).toBe(true); // 容差内
    expect(gradeAnswer("NUMERIC", "19.6N", "18")).toBe(false);
    expect(gradeAnswer("NUMERIC", "0.2g", 0.2)).toBe(true);
  });

  it("选择题：大小写不敏感", () => {
    expect(gradeAnswer("SINGLE_CHOICE", "B", "b")).toBe(true);
    expect(gradeAnswer("SINGLE_CHOICE", "B", "A")).toBe(false);
  });

  it("判断题", () => {
    expect(gradeAnswer("TRUE_FALSE", "正确", "正确")).toBe(true);
    expect(gradeAnswer("TRUE_FALSE", "错误", "正确")).toBe(false);
  });

  it("填空题：忽略空格和大小写", () => {
    expect(gradeAnswer("FILL_BLANK", "NaCl", " nacl ")).toBe(true);
    expect(gradeAnswer("FILL_BLANK", "Al2O3", "Al₂O₃")).toBe(false); // 下标字符不同，严格
  });

  it("空答案判错", () => {
    expect(gradeAnswer("NUMERIC", "19.6", "")).toBe(false);
    expect(gradeAnswer("SINGLE_CHOICE", "B", null)).toBe(false);
  });

  it("多问计算题：逐项比较，答全才算对", () => {
    expect(gradeAnswer("NUMERIC", "0.2A；2V", "0.2A；2V")).toBe(true);
    expect(gradeAnswer("NUMERIC", "0.2A；2V", "0.2,2")).toBe(true);
    expect(gradeAnswer("NUMERIC", "0.2A；2V", "0.2")).toBe(false); // 只答一问
    expect(gradeAnswer("NUMERIC", "800J；880J；90.9%", "800J；880J；90.9%")).toBe(true);
    expect(gradeAnswer("NUMERIC", "800J；880J；90.9%", "800J；880J；80%")).toBe(false);
    // 关键回归：旧实现会把 "800J；880J；90.9%" 拼成 80088090.9 导致永远判错
    expect(gradeAnswer("NUMERIC", "800J；880J；90.9%", "80088090.9")).toBe(false);
  });

  it("判断题：不同表述归一化", () => {
    expect(gradeAnswer("TRUE_FALSE", "正确", "对")).toBe(true);
    expect(gradeAnswer("TRUE_FALSE", "错误", "F")).toBe(true);
    expect(gradeAnswer("TRUE_FALSE", "正确", "错误")).toBe(false);
  });

  it("填空题：全角半角归一化", () => {
    expect(gradeAnswer("FILL_BLANK", "NaCl", "ＮａＣｌ")).toBe(true);
    expect(gradeAnswer("FILL_BLANK", "二氧化碳", "二氧化碳 ")).toBe(true);
  });

  it("科学计数法：标准答案 1.5×10⁴ 与学生写 15000 等价", () => {
    // 关键回归：旧实现把 "1.5×10⁴Pa" 拆成 [1.5,10,4]，学生答 15000 判错
    expect(gradeAnswer("NUMERIC", "1.5×10⁴Pa", "15000Pa")).toBe(true);
    expect(gradeAnswer("NUMERIC", "1.5×10⁴Pa", "1.5×10⁴Pa")).toBe(true);
    expect(gradeAnswer("NUMERIC", "2.52×10⁵J；69.4%", "252000J；69.4%")).toBe(true);
    expect(gradeAnswer("NUMERIC", "2.52×10⁵J；69.4%", "2.52×10⁵J；69.4%")).toBe(true);
    expect(gradeAnswer("NUMERIC", "1.0×10⁻³m³", "0.001m³")).toBe(true);
    expect(gradeAnswer("NUMERIC", "1.5×10⁴Pa", "1500Pa")).toBe(false);
  });
});
