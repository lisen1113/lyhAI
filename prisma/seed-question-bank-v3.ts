// 题库 V3 seed（幂等）— 变式补强卷，写入真实变式层级
import { PrismaClient } from "@prisma/client";
import { V3 } from "./question-bank-v3";
import { V4 } from "./question-bank-v4";

const prisma = new PrismaClient();

function buildSolution(steps: string[], answer: string): string {
  const labels = ["【考点】", "【分析】", "【运算】", "【结论】", "【补充】", "【补充】"];
  const body = steps.map((s, i) => `${labels[i] ?? "·"} ${s}`).join("\n");
  return `${body}\n【规范答案】${answer}`;
}

const TIER_LEVEL: Record<string, number> = { "原型": 1, "轻变式": 2, "情境变式": 3 };

async function main() {
  const BANK = [...V3, ...V4];
  console.log(`Loading V3+V4 variant bank: ${BANK.length} questions...`);
  const tagRows = await prisma.errorTag.findMany({ select: { id: true, code: true } });
  const tagMap = new Map(tagRows.map((t) => [t.code, t.id]));

  let created = 0, skipped = 0, missingNode = 0;
  for (const item of BANK) {
    const existing = await prisma.question.findFirst({ where: { source: item.key } });
    if (existing) { skipped++; continue; }

    const node = await prisma.knowledgeNode.findUnique({
      where: { code: item.node },
      include: { microSkills: { select: { id: true } } },
    });
    if (!node) { console.warn(`  [skip] node not found: ${item.node} (${item.key})`); missingNode++; continue; }

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

  const totals = await prisma.question.groupBy({
    by: ["variantLevel"],
    where: { deletedAt: null },
    _count: true,
  });
  const [ph, ch] = await Promise.all([
    prisma.question.count({ where: { deletedAt: null, subject: { code: "PH" } } }),
    prisma.question.count({ where: { deletedAt: null, subject: { code: "CH" } } }),
  ]);
  console.log({ created, skipped, missingNode, 物理: ph, 化学: ch });
  console.log("层级分布", totals.map((t) => `L${t.variantLevel}:${t._count}`).join(" "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
