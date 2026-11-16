// 题库 seed（幂等）— 由 question-data.ts 生成器驱动
import { PrismaClient, ReviewStatus } from "@prisma/client";
import { generateQuestions } from "./question-data";

const prisma = new PrismaClient();

// 生成器题库没有 tier 字段，用 difficulty 映射变式层级：
// L1 → 1 原型、L2 → 2 轻变式、L3 → 3 情境变式。
// 不写这个字段会导致整批题退回数据库默认值 1，专项训练选不出 L2/L3。
const LEVEL_BY_DIFFICULTY: Record<string, number> = { L1: 1, L2: 2, L3: 3 };

async function main() {
  console.log("Generating question bank...");
  const questions = generateQuestions();
  let created = 0, skipped = 0, noNode = 0;

  for (const q of questions) {
    // 幂等：按 key 查 standardAnswer+stem 组合（用 source 存 key）
    const existing = await prisma.question.findFirst({ where: { source: q.key } });
    if (existing) { skipped++; continue; }

    const node = await prisma.knowledgeNode.findUnique({ where: { code: q.nodeCode } });
    if (!node) { noNode++; continue; }

    const subject = await prisma.subject.findUnique({ where: { id: node.subjectId } });
    if (!subject) { noNode++; continue; }

    await prisma.question.create({
      data: {
        subjectId: subject.id,
        type: q.type,
        difficulty: q.difficulty,
        variantLevel: LEVEL_BY_DIFFICULTY[q.difficulty] ?? 1,
        stem: q.stem,
        options: q.options ? JSON.stringify(q.options) : undefined,
        standardAnswer: q.answer,
        solution: q.solution,
        estimatedTime: q.type === "NUMERIC" ? 60 : 30,
        source: q.key,
        reviewStatus: ReviewStatus.PUBLISHED, // 开发测试库：生成即审核通过，正式环境需人工审核
        hints: {
          create: q.hints.map((h, idx) => ({ level: idx + 1, content: h })),
        },
        knowledgeLinks: {
          create: [{ nodeId: node.id, isPrimary: true, variantGroup: q.variantGroup ?? null }],
        },
      },
    });
    created++;
  }

  const physCount = await prisma.question.count({ where: { subject: { code: "PH" } } });
  const chemCount = await prisma.question.count({ where: { subject: { code: "CH" } } });
  console.log(`Created ${created}, skipped ${skipped}, no-node ${noNode}`);
  console.log(`Total bank: 物理 ${physCount} 题 / 化学 ${chemCount} 题`);
  if (physCount < 120 || chemCount < 100) {
    console.warn(`WARNING: 测试库未达目标（物理120/化学100）`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
