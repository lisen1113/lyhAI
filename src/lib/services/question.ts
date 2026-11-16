// 题库服务层 — 判分逻辑与题目查询
import { prisma } from "@/lib/db";
import type { GenQuestion } from "../../../prisma/question-data";

/** 上标数字 → 普通数字，用于还原 10⁴ 这类科学计数法 */
const SUP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

/**
 * 科学计数法展开：把 "1.5×10⁴" 变成 "15000"，把 "2.52×10⁵J" 变成 "252000J"。
 * 不做这一步的话 extractNumbers 会把 "1.5×10⁴" 拆成 [1.5, 10, 4]，
 * 学生答 15000 反而判错。
 */
function expandSci(s: string): string {
  let t = String(s);
  // 上标 → ^n
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) =>
    "^" + m.split("").map((c) => SUP[c] ?? c).join("")
  );
  // a×10^n → 实际数值
  t = t.replace(
    /(\d+(?:[.．]\d+)?)\s*[×xX*]\s*10\s*\^\s*\(?\s*(-?\d+)\s*\)?/g,
    (_m, a: string, n: string) =>
      String(Number(String(a).replace("．", ".")) * Math.pow(10, Number(n)))
  );
  // 孤立的 10^n（如"密度约 10³kg/m³"）
  t = t.replace(/10\s*\^\s*\(?\s*(-?\d+)\s*\)?/g, (_m, n: string) =>
    String(Math.pow(10, Number(n)))
  );
  return t;
}

/** 提取字符串中的全部数值（支持负数、小数、科学计数法） */
function extractNumbers(s: string): number[] {
  const m = expandSci(s).match(/-?\d+(?:[.．]\d+)?/g);
  return m ? m.map((x) => Number(x.replace("．", "."))).filter((n) => !Number.isNaN(n)) : [];
}

/** 数值比较：相对误差 1% 或绝对误差 0.15（取大者） */
function numEqual(a: number, b: number): boolean {
  const tol = Math.max(Math.abs(b) * 0.01, 0.15);
  return Math.abs(a - b) <= tol;
}

/** 全角转半角 + 去空白，用于填空比较 */
function normalizeText(s: string): string {
  return String(s)
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 判断题答案归一化 */
function normalizeBool(s: string): string {
  const v = normalizeText(s);
  if (/^(正确|对|是|true|t|√|yes|y)$/.test(v)) return "T";
  if (/^(错误|错|否|false|f|×|x|no|n)$/.test(v)) return "F";
  return v.toUpperCase();
}

/** 判分：根据题型和答案比较 */
export function gradeAnswer(
  type: string,
  standardAnswer: string,
  answer: unknown,
  options?: unknown
): boolean {
  if (answer === null || answer === undefined || answer === "") return false;

  if (type === "NUMERIC") {
    // 标准答案可能是多个值（"0.2A；2V"、"800J；880J；90.9%"），逐个数值比较
    const stdNums = extractNumbers(standardAnswer);
    const ansNums = extractNumbers(String(answer));
    if (!stdNums.length || !ansNums.length) return false;
    if (stdNums.length === 1) return numEqual(ansNums[0], stdNums[0]);
    // 多问计算：必须答全且逐项匹配（顺序一致）
    if (ansNums.length < stdNums.length) return false;
    return stdNums.every((n, i) => numEqual(ansNums[i], n));
  }

  if (type === "SINGLE_CHOICE") {
    const ans = String(answer).trim().toUpperCase();
    const std = standardAnswer.trim().toUpperCase();
    return ans === std;
  }

  if (type === "TRUE_FALSE") {
    return normalizeBool(String(answer)) === normalizeBool(standardAnswer);
  }

  if (type === "FILL_BLANK") {
    return normalizeText(String(answer)) === normalizeText(standardAnswer);
  }

  // STEP_BY_STEP 等：默认精确匹配（容忍空白与全半角差异）
  return normalizeText(String(answer)) === normalizeText(standardAnswer);
}

/** 获取可训练题目（已发布、未删除） */
export async function getTrainableQuestions(filters?: {
  subjectCode?: string;
  nodeCode?: string;
  difficulty?: string;
  variantGroup?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = {
    reviewStatus: "PUBLISHED",
    deletedAt: null,
  };
  if (filters?.subjectCode) (where as Record<string, unknown>).subject = { code: filters.subjectCode };
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.nodeCode || filters?.variantGroup) {
    (where as Record<string, unknown>).knowledgeLinks = {
      some: {
        ...(filters.nodeCode ? { node: { code: filters.nodeCode } } : {}),
        ...(filters.variantGroup ? { variantGroup: filters.variantGroup } : {}),
      },
    };
  }
  return prisma.question.findMany({
    where: where as never,
    include: {
      hints: { orderBy: { level: "asc" } },
      knowledgeLinks: { include: { node: true } },
      subject: true,
    },
    take: filters?.limit ?? 50,
    orderBy: { createdAt: "asc" },
  });
}

export async function getQuestionById(id: string) {
  return prisma.question.findFirst({
    where: { id, deletedAt: null },
    include: {
      hints: { orderBy: { level: "asc" } },
      knowledgeLinks: { include: { node: true } },
      errorTags: { include: { errorTag: true } },
    },
  });
}
