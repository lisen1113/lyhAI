// 清理旧版"换数字"套路题：source 以 PQ-/CQ- 开头（旧生成器），
// 以及 seed.ts 中的 seed-q-* 测试题。保留新高质量的 PQ2-/CQ2- 题库。
// 注意：不删除已有 QuestionAttempt（答题记录不可覆盖/删除原则）——先检查引用。
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const legacy = await p.question.findMany({
    where: { OR: [
      { source: { startsWith: "PQ-" } },
      { source: { startsWith: "CQ-" } },
      { source: { startsWith: "seed-q-" } },
    ] },
    select: { id: true, source: true },
  });
  console.log(`Legacy questions to remove: ${legacy.length}`);

  // 检查是否有答题/计划/测验引用
  const ids = legacy.map((q) => q.id);
  const attempts = await p.questionAttempt.count({ where: { questionId: { in: ids } } });
  const planItems = await p.dailyPlanItem.count({ where: { questionId: { in: ids } } });
  const assessQ = await p.assessmentQuestion.count({ where: { questionId: { in: ids } } });
  console.log(`Referenced by: attempts=${attempts}, planItems=${planItems}, assessmentQ=${assessQ}`);

  // 数据最小化：开发测试数据可清理（用户尚未正式使用）。若已引用则软删除保留审计链。
  if (attempts > 0 || planItems > 0 || assessQ > 0) {
    await p.question.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date(), reviewStatus: "REJECTED" } });
    console.log(`Soft-deleted ${ids.length} legacy questions (references preserved).`);
  } else {
    // 先删子表
    await p.questionHint.deleteMany({ where: { questionId: { in: ids } } });
    await p.questionErrorTag.deleteMany({ where: { questionId: { in: ids } } });
    await p.questionKnowledge.deleteMany({ where: { questionId: { in: ids } } });
    await p.question.deleteMany({ where: { id: { in: ids } } });
    console.log(`Hard-deleted ${ids.length} legacy questions (no references).`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
