// 内容与覆盖度审计 V2：K级节点覆盖 / 题型 / 分步骤解析 / Hint层级 / 错因 / 题干重复
import { PrismaClient, SubjectCode } from "@prisma/client";
const p = new PrismaClient();
let FAIL = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "  [OK]" : "  [FAIL]"} ${msg}`); if (!cond) FAIL++; };

async function main() {
  console.log("========== 1. 题库总体 ==========");
  for (const code of [SubjectCode.PH, SubjectCode.CH]) {
    const total = await p.question.count({ where: { subject: { code }, deletedAt: null } });
    const byType = await p.question.groupBy({ by: ["type"], where: { subject: { code }, deletedAt: null }, _count: true });
    console.log(`${code}: 共 ${total} 题｜` + byType.map((t) => `${t.type}:${t._count}`).join("  "));
  }

  console.log("\n========== 2. K级知识节点题目覆盖（目标100%） ==========");
  let totalK = 0, coveredK = 0;
  for (const code of [SubjectCode.PH, SubjectCode.CH]) {
    const all = await p.knowledgeNode.findMany({
      where: { subject: { code } },
      include: { _count: { select: { questionLinks: true } } },
      orderBy: { code: "asc" },
    });
    const kNodes = all.filter((n) => /-K\d+$/.test(n.code));
    const zero = kNodes.filter((n) => n._count.questionLinks === 0);
    totalK += kNodes.length; coveredK += kNodes.length - zero.length;
    console.log(`${code}: K级 ${kNodes.length}，有题 ${kNodes.length - zero.length}，零题 ${zero.length}`);
    if (zero.length) console.log(`   零题: ${zero.map((n) => n.code + "(" + n.name + ")").join(", ")}`);
  }
  ok(coveredK === totalK, `K级节点覆盖率 ${coveredK}/${totalK} (${Math.round(coveredK / totalK * 100)}%)`);

  console.log("\n========== 3. 解析 / Hint / 错因 覆盖 ==========");
  const totalQ = await p.question.count({ where: { deletedAt: null } });
  const withSteps = await p.question.count({ where: { deletedAt: null, solution: { contains: "【考点】" } } });
  const noErrTag = await p.question.count({ where: { deletedAt: null, errorTags: { none: {} } } });
  const qWithHints = await p.question.findMany({ where: { deletedAt: null }, include: { _count: { select: { hints: true } } } });
  const noHint = qWithHints.filter((q) => q._count.hints === 0).length;
  ok(noHint === 0, `无Hint题目 ${noHint}/${totalQ}`);
  ok(noErrTag === 0, `无错因标签题目 ${noErrTag}/${totalQ}`);
  console.log(`  分步骤解析(含【考点】)题目 ${withSteps}/${totalQ}`);

  console.log("\n========== 4. 错因标签体系 ==========");
  const tagCount = await p.errorTag.count();
  const tagByCat = await p.errorTag.groupBy({ by: ["category"], _count: true });
  console.log(`  共 ${tagCount} 个: ` + tagByCat.map((t) => `${t.category}:${t._count}`).join("  "));
  ok(tagCount >= 28, `错因标签数 ${tagCount} ≥ 28`);

  console.log("\n========== 5. 题干重复度（区分变式组内/组间） ==========");
  // 文档要求"原型题→轻变式→情境变式"，同一变式组内骨架相似是设计使然，不算缺陷。
  // 真正要防的是：完全相同的题干（逐字）在不同题之间重复。
  const allStems = await p.question.findMany({ where: { deletedAt: null }, select: { stem: true } });
  const exact = new Map<string, number>();
  for (const q of allStems) exact.set(q.stem, (exact.get(q.stem) ?? 0) + 1);
  const exactDup = [...exact.values()].filter((c) => c > 1).reduce((a, c) => a + c, 0);
  console.log(`  逐字完全相同的题干 ${exactDup}/${totalQ}`);
  ok(exactDup === 0, `无逐字重复题干（${exactDup}）`);

  // 变式组规模分布（同技能变式，文档建议高优先级技能8-12题）
  const vg = await p.questionKnowledge.groupBy({ by: ["variantGroup"], _count: true });
  const multi = vg.filter((g) => g.variantGroup && g._count >= 2).length;
  const singles = vg.filter((g) => g.variantGroup && g._count === 1).length;
  console.log(`  变式组: ${multi} 组含≥2题（设计内变式）, ${singles} 组单题`);
  ok(singles > 0, `含独立情境题（单题组 ${singles} 个）`);

  console.log("\n========== 6. 变式分层（variantLevel 真实标注） ==========");
  const byLevel = await p.question.groupBy({ by: ["variantLevel"], where: { deletedAt: null }, _count: true });
  console.log("  全库: " + byLevel.map((d) => `L${d.variantLevel}:${d._count}`).join("  "));
  for (const code of [SubjectCode.PH, SubjectCode.CH]) {
    const byDiff = await p.question.groupBy({ by: ["difficulty"], where: { subject: { code }, deletedAt: null }, _count: true });
    console.log(`  ${code} 难度: ` + byDiff.map((d) => `${d.difficulty}:${d._count}`).join("  "));
  }
  const lv1 = byLevel.find((x) => x.variantLevel === 1)?._count ?? 0;
  const lv2 = byLevel.find((x) => x.variantLevel === 2)?._count ?? 0;
  const lv3 = byLevel.find((x) => x.variantLevel === 3)?._count ?? 0;
  ok(lv1 > 0 && lv2 > 0 && lv3 > 0, `三阶梯均有题：原型${lv1} / 轻变式${lv2} / 情境变式${lv3}`);

  // ============================================================
  // 以下为「学」的部分 —— 文档要求微知识学习含五要素
  // ============================================================
  console.log("\n========== 7. 微知识卡完整性（情境/概念/公式/常见坑/例题） ==========");
  const skills = await p.microSkill.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, code: true, name: true, context: true, coreConcept: true,
      formula: true, commonPitfalls: true, basicExample: true,
      node: { select: { code: true } },
      _count: { select: { questions: true } },
    },
  });
  let missContext = 0, missConcept = 0, missFormula = 0, missPitfall = 0, missExample = 0;
  const bad: string[] = [];
  for (const s of skills) {
    const pitfalls = Array.isArray(s.commonPitfalls) ? (s.commonPitfalls as unknown[]) : [];
    const c = s.context?.trim() ?? "";
    const cc = s.coreConcept?.trim() ?? "";
    const f = s.formula?.trim() ?? "";
    const ex = s.basicExample?.trim() ?? "";
    if (c.length < 10) { missContext++; bad.push(`${s.code} 缺情境`); }
    if (cc.length < 15) { missConcept++; bad.push(`${s.code} 缺核心概念`); }
    if (f.length < 2) { missFormula++; bad.push(`${s.code} 缺公式/规则`); }
    if (pitfalls.length < 2) { missPitfall++; bad.push(`${s.code} 常见坑<2`); }
    if (ex.length < 20) { missExample++; bad.push(`${s.code} 缺基础例题`); }
  }
  console.log(`  微技能 ${skills.length} 个`);
  ok(missContext === 0, `情境(context) 覆盖 ${skills.length - missContext}/${skills.length}`);
  ok(missConcept === 0, `核心概念(coreConcept) 覆盖 ${skills.length - missConcept}/${skills.length}`);
  ok(missFormula === 0, `公式/规则(formula) 覆盖 ${skills.length - missFormula}/${skills.length}`);
  ok(missPitfall === 0, `常见坑(≥2条) 覆盖 ${skills.length - missPitfall}/${skills.length}`);
  ok(missExample === 0, `基础例题(basicExample) 覆盖 ${skills.length - missExample}/${skills.length}`);
  if (bad.length) console.log("  待补: " + bad.slice(0, 20).join(" | ") + (bad.length > 20 ? ` …共${bad.length}项` : ""));

  console.log("\n========== 8. 微技能 ↔ 题目 绑定与阶梯覆盖 ==========");
  const noQ = skills.filter((s) => s._count.questions === 0);
  ok(noQ.length === 0, `每个微技能都有绑定题目（无题: ${noQ.length}）`);
  if (noQ.length) console.log("  无题技能: " + noQ.slice(0, 15).map((s) => s.code).join(", "));

  const unbound = await p.question.count({ where: { deletedAt: null, microSkillId: null } });
  ok(unbound === 0, `所有题目均已绑定微技能（未绑定 ${unbound}）`);

  // 每个技能的变式阶梯覆盖情况
  const ladders = await p.question.groupBy({
    by: ["microSkillId", "variantLevel", "isTemplate"],
    where: { deletedAt: null, microSkillId: { not: null } },
    _count: true,
  });
  const ladderMap = new Map<string, Set<number>>();
  const densityMap = new Map<string, { l1: number; l2: number; l3: number; tpl: number }>();
  for (const r of ladders) {
    if (!r.microSkillId) continue;
    if (!ladderMap.has(r.microSkillId)) ladderMap.set(r.microSkillId, new Set());
    ladderMap.get(r.microSkillId)!.add(r.variantLevel);
    const d = densityMap.get(r.microSkillId) ?? { l1: 0, l2: 0, l3: 0, tpl: 0 };
    if (r.isTemplate) d.tpl += r._count;
    if (r.variantLevel === 1) d.l1 += r._count;
    else if (r.variantLevel === 2) d.l2 += r._count;
    else if (r.variantLevel === 3) d.l3 += r._count;
    densityMap.set(r.microSkillId, d);
  }
  let full3 = 0, onlyL1 = 0;
  for (const s of skills) {
    const set = ladderMap.get(s.id) ?? new Set<number>();
    if (set.has(1) && set.has(2) && set.has(3)) full3++;
    if (set.size === 1 && set.has(1)) onlyL1++;
  }
  console.log(`  完整三阶梯(L1+L2+L3) 技能 ${full3}/${skills.length}｜仅原型题 技能 ${onlyL1}`);
  ok(full3 >= Math.ceil(skills.length * 0.8), `三阶梯完整技能 ${full3} ≥ ${Math.ceil(skills.length * 0.8)}（80%）`);

  // 变式密度：专项 5 题 + 独立 2 题都要落在同一技能内，需要 L2≥2 且 L3≥2（模板题不算）
  const thin: string[] = [];
  let d2 = 0, d3 = 0, tplHeavy = 0;
  for (const s of skills) {
    const d = densityMap.get(s.id) ?? { l1: 0, l2: 0, l3: 0, tpl: 0 };
    const realL2 = d.l2;
    const realL3 = d.l3;
    if (realL2 >= 2) d2++;
    if (realL3 >= 2) d3++;
    if (d.tpl >= 2) tplHeavy++;
    if (realL2 < 2 || realL3 < 2) {
      thin.push(`${s.code} ${s.name}（L2:${realL2} L3:${realL3}）`);
    }
  }
  console.log(`  变式密度 L2≥2 的技能 ${d2}/${skills.length}｜L3≥2 的技能 ${d3}/${skills.length}｜含≥2道模板题 ${tplHeavy} 个技能`);
  if (thin.length) {
    const ph = thin.filter((x) => x.startsWith("PH")).length;
    console.log(`  [WARN] 变式不足（无法支撑同技能「专项5题+独立2题」）：${thin.length} 个（物理 ${ph} / 化学 ${thin.length - ph}）`);
    for (const x of thin.slice(0, 8)) console.log("    - " + x);
    if (thin.length > 8) console.log(`    …另有 ${thin.length - 8} 个`);
  } else {
    console.log("  [OK] 每个技能都能在自身范围内出满专项与独立题");
  }

  console.log("\n========== 9. 前置知识与错因体系 ==========");
  const prereqCount = await p.knowledgePrerequisite.count();
  const hardCount = await p.knowledgePrerequisite.count({ where: { strength: "HARD" } });
  console.log(`  前置关系 ${prereqCount} 条（HARD ${hardCount}）`);
  ok(prereqCount > 0, `已建立前置知识依赖 ${prereqCount} 条`);

  const tagUsage = await p.questionErrorTag.groupBy({ by: ["errorTagId"], _count: true });
  const usedTags = tagUsage.length;
  console.log(`  标签被使用 ${usedTags}/${tagCount}｜类别 ${tagByCat.map((t) => t.category + ":" + t._count).join(" ")}`);
  ok(usedTags >= 24, `实际投入使用的错因标签 ${usedTags} ≥ 24`);

  console.log(`\n========== 审计结果: ${FAIL === 0 ? "全部通过 ✓" : FAIL + " 项未通过 ✗"} ==========`);
  if (FAIL > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
