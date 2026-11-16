// 高质量题库 V2 seed（幂等）— 分步骤解析 / 递进Hint / 错因标签 / 变式组
import { PrismaClient, ReviewStatus } from "@prisma/client";
import { QUESTION_BANK_V2 } from "./question-bank-v2";
import { EXT } from "./question-bank-v2-ext";

const prisma = new PrismaClient();

/** 把分步骤解析拼成结构化文本（考点→已知→所求→公式→运算→答案） */
function buildSolution(steps: string[], answer: string): string {
  const labels = ["【考点】", "【分析】", "【运算】", "【结论】", "【补充】", "【补充】"];
  const body = steps.map((s, i) => `${labels[i] ?? "·"} ${s}`).join("\n");
  return `${body}\n【规范答案】${answer}`;
}

async function main() {
  const BANK = [...QUESTION_BANK_V2, ...EXT];
  console.log(`Loading V2 question bank: ${BANK.length} curated questions...`);
  let created = 0, skipped = 0, missingNode = 0, missingTag = 0;

  // 预载错因标签 code→id
  const tagRows = await prisma.errorTag.findMany({ select: { id: true, code: true } });
  const tagMap = new Map(tagRows.map((t) => [t.code, t.id]));

  for (const item of BANK) {
    const existing = await prisma.question.findFirst({ where: { source: item.key } });
    if (existing) { skipped++; continue; }

    const node = await prisma.knowledgeNode.findUnique({ where: { code: item.node } });
    if (!node) { console.warn(`  [skip] node not found: ${item.node} (${item.key})`); missingNode++; continue; }

    const subject = await prisma.subject.findUnique({ where: { id: node.subjectId } });
    if (!subject) { missingNode++; continue; }

    // 选项格式：单选用 [{key,text}]
    const options = item.options
      ? JSON.stringify(item.options.map((text, i) => ({ key: "ABCD"[i], text })))
      : undefined;

    // Hint1/2/3 + 完整解析L4
    const hintContents = [
      `【方向提示】${item.hints[0]}`,
      `【关键条件】${item.hints[1]}`,
      `【公式框架】${item.hints[2]}`,
      `【完整解析·Level4】\n${buildSolution(item.steps, item.answer)}`,
    ];

    const validTagIds = item.errors.map((c) => tagMap.get(c)).filter((x): x is string => !!x);
    if (validTagIds.length !== item.errors.length) {
      missingTag += item.errors.length - validTagIds.length;
    }

    await prisma.question.create({
      data: {
        subjectId: subject.id,
        type: item.type,
        difficulty: item.difficulty,
        stem: item.stem,
        options,
        standardAnswer: item.answer,
        solution: buildSolution(item.steps, item.answer),
        estimatedTime: item.minutes,
        source: item.key,
        reviewStatus: ReviewStatus.PUBLISHED,
        hints: { create: hintContents.map((content, idx) => ({ level: idx + 1, content })) },
        knowledgeLinks: { create: [{ nodeId: node.id, isPrimary: true, variantGroup: item.group }] },
        ...(validTagIds.length
          ? { errorTags: { create: validTagIds.map((errorTagId) => ({ errorTagId })) } }
          : {}),
      },
    });
    created++;
  }

  console.log(`Created ${created}, skipped ${skipped}, missing-node ${missingNode}, missing-tag-codes ${missingTag}`);
  const phys = await prisma.question.count({ where: { subject: { code: "PH" }, deletedAt: null } });
  const chem = await prisma.question.count({ where: { subject: { code: "CH" }, deletedAt: null } });
  console.log(`Bank now: 物理 ${phys} / 化学 ${chem}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
