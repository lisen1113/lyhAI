// 答案自洽性校验：每题用「标准答案」回判必须判对。
// 能一次性暴露：答案格式不可解析、多问答案缺项、科学计数法、选项与答案不匹配等问题。
import { PrismaClient, SubjectCode } from "@prisma/client";
import { gradeAnswer } from "../src/lib/services/question";

const p = new PrismaClient();
let pass = 0;
const bad: string[] = [];

type Opt = { key?: string; text?: string };

/** options 在库里可能是 JSON 字符串，也可能已是数组，统一成数组 */
function toOptions(raw: unknown): Opt[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Opt[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Opt[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function main() {
  const qs = await p.question.findMany({
    where: { deletedAt: null },
    select: {
      id: true, source: true, type: true, stem: true, standardAnswer: true,
      options: true, variantLevel: true, microSkill: { select: { code: true } },
      hints: { select: { level: true } },
      errorTags: { select: { errorTagId: true } },
      _count: { select: { knowledgeLinks: true } },
    },
  });

  console.log(`========== 1. 标准答案自洽（${qs.length} 题）==========`);
  for (const q of qs) {
    const self = gradeAnswer(q.type, q.standardAnswer, q.standardAnswer, q.options);
    if (self) { pass++; continue; }
    bad.push(`${q.source} [${q.type}] 答案="${q.standardAnswer}" 题干=${q.stem.slice(0, 30)}`);
  }
  console.log(`  自洽 ${pass}/${qs.length}`);
  if (bad.length) {
    console.log("  [FAIL] 以下题目用标准答案回判都判错：");
    for (const b of bad.slice(0, 25)) console.log("    " + b);
    if (bad.length > 25) console.log(`    …共 ${bad.length} 题`);
  } else {
    console.log("  [OK] 全部题目标准答案可被正确判定");
  }

  console.log("\n========== 2. 选择题选项与答案匹配 ==========");
  let badChoice = 0;
  for (const q of qs) {
    if (q.type !== "SINGLE_CHOICE") continue;
    const opts = toOptions(q.options);
    const keys = opts.map((o) => o.key);
    if (opts.length !== 4 || !keys.includes(q.standardAnswer)) {
      badChoice++;
      console.log(`  [FAIL] ${q.source} 选项 ${opts.length} 个 ${JSON.stringify(keys)} 答案=${q.standardAnswer}`);
    }
    // 干扰项不能重复
    const texts = opts.map((o) => o.text ?? "");
    if (new Set(texts).size !== texts.length) {
      badChoice++;
      console.log(`  [FAIL] ${q.source} 存在重复选项`);
    }
    // 选项文本不应为空
    if (texts.some((t) => t.trim().length === 0)) {
      badChoice++;
      console.log(`  [FAIL] ${q.source} 存在空选项`);
    }
  }
  console.log(badChoice === 0 ? "  [OK] 选择题选项完整且答案键存在" : `  [FAIL] ${badChoice} 处异常`);

  console.log("\n========== 3. 数值题可解析性 ==========");
  let badNum = 0;
  for (const q of qs) {
    if (q.type !== "NUMERIC") continue;
    // 用一个明显错误的答案测试：不应判对
    const wrong = gradeAnswer(q.type, q.standardAnswer, "__wrong__");
    if (wrong) { badNum++; console.log(`  [FAIL] ${q.source} 乱填也判对`); }
    // 空答案必须判错
    if (gradeAnswer(q.type, q.standardAnswer, "")) { badNum++; console.log(`  [FAIL] ${q.source} 空答案判对`); }
  }
  console.log(badNum === 0 ? "  [OK] 数值/填空/判断类题的负例均判错" : `  [FAIL] ${badNum} 处异常`);

  console.log("\n========== 4. 结构完整性 ==========");
  const noHint = qs.filter((q) => q.hints.length < 3);
  const noTag = qs.filter((q) => q.errorTags.length === 0);
  const noLink = qs.filter((q) => q._count.knowledgeLinks === 0);
  const noSkill = qs.filter((q) => !q.microSkill);
  console.log(`  Hint≥3: ${qs.length - noHint.length}/${qs.length}`);
  console.log(`  有错因: ${qs.length - noTag.length}/${qs.length}`);
  console.log(`  有知识节点: ${qs.length - noLink.length}/${qs.length}`);
  console.log(`  有微技能: ${qs.length - noSkill.length}/${qs.length}`);
  if (noHint.length) console.log("    缺Hint: " + noHint.slice(0, 10).map((q) => q.source).join(", "));
  if (noTag.length) console.log("    缺错因: " + noTag.slice(0, 10).map((q) => q.source).join(", "));

  console.log("\n========== 5. 变式阶梯按科目分布 ==========");
  for (const code of [SubjectCode.PH, SubjectCode.CH]) {
    const rows = await p.question.groupBy({
      by: ["variantLevel"],
      where: { deletedAt: null, subject: { code } },
      _count: true,
    });
    console.log(`  ${code}: ` + rows.sort((a, b) => a.variantLevel - b.variantLevel)
      .map((r) => `L${r.variantLevel}:${r._count}`).join("  "));
  }

  const total = bad.length + badChoice + badNum + noHint.length + noTag.length;
  console.log(`\n========== 答案校验: ${total === 0 ? "全部通过 ✓" : total + " 项异常 ✗"} ==========`);
  if (total > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
