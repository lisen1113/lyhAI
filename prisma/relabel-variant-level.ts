// 按题库原始 tier 标注重写 variantLevel
// 背景：此前用 difficulty(L1/L2/L3) 近似变式层级，导致「速度」等技能 4 道题全被标成原型；
// 实际题库定义里它们是 原型 / 轻变式 / 情境变式。本脚本以 source 键回查权威标注。
import { PrismaClient } from "@prisma/client";
import { QUESTION_BANK_V2 } from "./question-bank-v2";
import { EXT } from "./question-bank-v2-ext";
import { V3 } from "./question-bank-v3";
import { V4 } from "./question-bank-v4";

const prisma = new PrismaClient();

const TIER_LEVEL: Record<string, number> = { "原型": 1, "轻变式": 2, "情境变式": 3 };

async function main() {
  const all = [...QUESTION_BANK_V2, ...EXT, ...V3, ...V4];
  const map = new Map(all.map((q) => [q.key, TIER_LEVEL[q.tier] ?? 1]));
  console.log(`题库定义 ${all.length} 条，tier 映射就绪`);

  const questions = await prisma.question.findMany({
    where: { deletedAt: null },
    select: { id: true, source: true, variantLevel: true },
  });

  let updated = 0;
  let untouched = 0;
  for (const q of questions) {
    const level = q.source ? map.get(q.source) : undefined;
    if (!level) { untouched++; continue; }
    if (level !== q.variantLevel) {
      await prisma.question.update({ where: { id: q.id }, data: { variantLevel: level } });
      updated++;
    }
  }

  const dist = await prisma.question.groupBy({
    by: ["variantLevel"],
    where: { deletedAt: null },
    _count: true,
    orderBy: { variantLevel: "asc" },
  });
  console.log({ updated, untouched, 分布: dist.map((d) => `L${d.variantLevel}:${d._count}`).join(" ") });

  // 逐技能三层覆盖
  const skills = await prisma.microSkill.findMany({
    where: { node: { subject: { code: "PH" } } },
    select: { id: true, code: true, name: true },
  });
  let full = 0, two = 0, one = 0, zero = 0;
  for (const s of skills) {
    const qs = await prisma.question.findMany({
      where: { microSkillId: s.id, deletedAt: null },
      select: { variantLevel: true },
    });
    const levels = new Set(qs.map((q) => q.variantLevel));
    if (levels.size >= 3) full++;
    else if (levels.size === 2) two++;
    else if (levels.size === 1) one++;
    else zero++;
  }
  console.log(`物理技能层级覆盖：三层 ${full} / 两层 ${two} / 一层 ${one} / 无题 ${zero}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
