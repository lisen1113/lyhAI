// 题库 V5/V6 seed（幂等）— 补齐「只有原型题」的 39 个微技能，使每个技能都有完整阶梯
import { PrismaClient } from "@prisma/client";
import { V5_PHYSICS } from "./question-bank-v5-physics";
import { V6_CHEMISTRY } from "./question-bank-v6-chemistry";
import { V7 } from "./question-bank-v7";
import { V8 } from "./question-bank-v8";
import { V9 } from "./question-bank-v9";
import { V10 } from "./question-bank-v10";
import { V11 } from "./question-bank-v11";
import { V12_PHYSICS } from "./question-bank-v12-physics";
import { V12_CHEMISTRY } from "./question-bank-v12-chemistry";
import { V13_ELECTRICITY } from "./question-bank-v13-electricity";
import { V14_MECHANICS } from "./question-bank-v14-mechanics";
import { V14_OPTICS_HEAT } from "./question-bank-v14-optics-heat";
import { V15_CHEM_A } from "./question-bank-v15-chem-a";
import { V15_CHEM_B } from "./question-bank-v15-chem-b";
import { V15_CHEM_C } from "./question-bank-v15-chem-c";
import { V16_CHEM } from "./question-bank-v16-chem";
import { V17_CHEM } from "./question-bank-v17-chem";
import { V18_PHYSICS_A } from "./question-bank-v18-physics-a";
import { V19_PHYSICS_B } from "./question-bank-v19-physics-b";
import { V19_PHYSICS_C } from "./question-bank-v19-physics-c";
import { V20_PHYSICS_D } from "./question-bank-v20-physics-d";
import { V20_PHYSICS_E } from "./question-bank-v20-physics-e";
import { V21_PHYSICS_FIX } from "./question-bank-v21-physics-fix";

const prisma = new PrismaClient();

function buildSolution(steps: string[], answer: string): string {
  const labels = ["【考点】", "【分析】", "【运算】", "【结论】", "【补充】", "【补充】"];
  const body = steps.map((s, i) => `${labels[i] ?? "·"} ${s}`).join("\n");
  return `${body}\n【规范答案】${answer}`;
}

const TIER_LEVEL: Record<string, number> = { "原型": 1, "轻变式": 2, "情境变式": 3 };

async function main() {
  const BANK = [...V5_PHYSICS, ...V6_CHEMISTRY, ...V7, ...V8, ...V9, ...V10, ...V11, ...V12_PHYSICS, ...V12_CHEMISTRY, ...V13_ELECTRICITY, ...V14_MECHANICS, ...V14_OPTICS_HEAT, ...V15_CHEM_A, ...V15_CHEM_B, ...V15_CHEM_C, ...V16_CHEM, ...V17_CHEM, ...V18_PHYSICS_A, ...V19_PHYSICS_B, ...V19_PHYSICS_C, ...V20_PHYSICS_D, ...V20_PHYSICS_E, ...V21_PHYSICS_FIX];
  console.log(`Loading V5+V6 ladder bank: ${BANK.length} questions...`);
  const tagRows = await prisma.errorTag.findMany({ select: { id: true, code: true } });
  const tagMap = new Map(tagRows.map((t) => [t.code, t.id]));

  let created = 0, skipped = 0, missingNode = 0, badTag = 0, multiSkill = 0;
  for (const item of BANK) {
    const existing = await prisma.question.findFirst({ where: { source: item.key } });
    if (existing) { skipped++; continue; }

    const node = await prisma.knowledgeNode.findUnique({
      where: { code: item.node },
      include: { microSkills: { select: { id: true, code: true } } },
    });
    if (!node) { console.warn(`  [skip] 节点不存在: ${item.node} (${item.key})`); missingNode++; continue; }
    if (node.microSkills.length !== 1) {
      console.warn(`  [注意] 节点 ${item.node} 下有 ${node.microSkills.length} 个微技能 (${item.key})`);
      multiSkill++;
    }

    const options = item.options
      ? JSON.stringify(item.options.map((text, i) => ({ key: "ABCD"[i], text })))
      : undefined;

    const hintContents = [
      `【方向提示】${item.hints[0]}`,
      `【关键条件】${item.hints[1]}`,
      `【公式框架】${item.hints[2]}`,
      `【完整解析·Level4】\n${buildSolution(item.steps, item.answer)}`,
    ];

    const validTagIds = item.errors.map((c) => tagMap.get(c)).filter((x): x is string => !!x);
    if (validTagIds.length !== item.errors.length) badTag++;

    await prisma.question.create({
      data: {
        subjectId: node.subjectId,
        type: item.type,
        difficulty: item.difficulty,
        stem: item.stem,
        options,
        standardAnswer: item.answer,
        solution: buildSolution(item.steps, item.answer),
        estimatedTime: item.minutes,
        source: item.key,
        reviewStatus: "PUBLISHED",
        variantLevel: TIER_LEVEL[item.tier] ?? 1,
        isTemplate: false,
        microSkillId: node.microSkills[0]?.id ?? null,
        knowledgeLinks: {
          create: [{ nodeId: node.id, isPrimary: true, variantGroup: item.group }],
        },
        hints: {
          create: hintContents.map((content, i) => ({ level: i + 1, content })),
        },
        errorTags: {
          create: validTagIds.map((id) => ({ errorTagId: id })),
        },
      },
    });
    created++;
  }

  const [ph, ch, total] = await Promise.all([
    prisma.question.count({ where: { deletedAt: null, subject: { code: "PH" } } }),
    prisma.question.count({ where: { deletedAt: null, subject: { code: "CH" } } }),
    prisma.question.count({ where: { deletedAt: null } }),
  ]);
  const totals = await prisma.question.groupBy({ by: ["variantLevel"], where: { deletedAt: null }, _count: true });
  console.log({ created, skipped, missingNode, badTag, multiSkill, 物理: ph, 化学: ch, 总数: total });
  console.log("层级分布", totals.sort((a, b) => a.variantLevel - b.variantLevel).map((t) => `L${t.variantLevel}:${t._count}`).join(" "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
