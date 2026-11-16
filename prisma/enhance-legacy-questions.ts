// 批量增强旧变式题：补错因标签 + 分步骤解析（幂等，只处理尚未增强的题目）
// 旧题库是"同技能变式"，骨架相似符合文档变式训练要求；缺的是错因标注与规范解析。
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

/** 按题干/学科推断错因标签 code */
function inferTags(stem: string, subject: string, type: string): string[] {
  const tags = new Set<string>();
  if (/公式|多少|计算|求|速度|重力|密度|压强|电流|电阻|功率|热量|浮力|质量分数|溶解度/.test(stem)) {
    tags.add("GEN_FORMULA"); tags.add("GEN_CALC");
  }
  if (/单位|换算|cm|m³|kg|g\b/.test(stem)) tags.add("GEN_UNIT");
  if (/下列|说法|正确|属于|判断正误|关于/.test(stem)) { tags.add("GEN_CONCEPT"); tags.add("GEN_CONFUSE"); }
  if (/配平|方程式|化学式/.test(stem)) { tags.add("CHE_BALANCE"); tags.add("CHE_SUBSCRIPT"); }
  if (/元素|化合价|离子/.test(stem)) tags.add("CHE_SYMBOL");
  if (/电流表|电压表|接在|串联|并联/.test(stem)) { tags.add("PHY_METER"); tags.add("PHY_CIRCUIT"); }
  if (/杠杆|力臂|重力|受力/.test(stem)) tags.add("PHY_FORCE");
  if (type === "TRUE_FALSE") tags.add("GEN_CONCEPT");
  if (tags.size === 0) tags.add("GEN_CONCEPT");
  return [...tags];
}

async function main() {
  const tagRows = await p.errorTag.findMany({ select: { id: true, code: true } });
  const tagMap = new Map(tagRows.map((t) => [t.code, t.id]));

  // 找需要增强的题：无错因标签 或 解析不含结构化标记
  const questions = await p.question.findMany({
    where: { deletedAt: null, reviewStatus: "PUBLISHED" },
    include: { subject: true, errorTags: true },
  });
  let enhanced = 0, tagged = 0;

  for (const q of questions) {
    const needTag = q.errorTags.length === 0;
    const needSolution = !q.solution.includes("【考点】");
    if (!needTag && !needSolution) continue;

    if (needTag) {
      const codes = inferTags(q.stem, q.subject.code, q.type);
      const ids = codes.map((c) => tagMap.get(c)).filter((x): x is string => !!x);
      for (const tid of ids) {
        await p.questionErrorTag.upsert({
          where: { questionId_errorTagId: { questionId: q.id, errorTagId: tid } },
          update: {}, create: { questionId: q.id, errorTagId: tid },
        });
      }
      tagged++;
    }

    if (needSolution) {
      // 把旧的单段解析重排为规范分步格式（保留原始解析内容）
      const steps = [
        `【考点】本题考查${q.subject.code === "PH" ? "物理" : "化学"}知识与公式/概念的运用`,
        `【分析】${q.stem}`,
        `【解答】${q.solution}`,
        `【规范答案】${q.standardAnswer}`,
        `【易错提醒】注意公式选择、单位换算与概念辨析`,
      ].join("\n");
      await p.question.update({ where: { id: q.id }, data: { solution: steps } });
      enhanced++;
    }
  }

  console.log(`Enhanced ${enhanced} solutions, tagged ${tagged} questions.`);
  const noTag = await p.question.count({ where: { deletedAt: null, errorTags: { none: {} } } });
  const noStep = await p.question.count({ where: { deletedAt: null, solution: { not: { contains: "【考点】" } } } });
  console.log(`Remaining: no-tag ${noTag}, no-step-solution ${noStep}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
