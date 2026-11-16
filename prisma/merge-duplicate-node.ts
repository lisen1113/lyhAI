// 清理重复 K 节点：把题目关联迁移到规范节点后删除
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PAIRS: Array<[string, string]> = [
  ["PH-M07-U02-K03", "PH-M07-U01-K02"], // 重力（旧层级）→ 规范节点
  ["CH-M03-K02", "CH-M03-U02-K01"],     // 氧气性质（旧层级）→ 规范节点
];

async function main() {
  for (const [oldCode, newCode] of PAIRS) {
    const oldNode = await prisma.knowledgeNode.findUnique({ where: { code: oldCode } });
    const newNode = await prisma.knowledgeNode.findUnique({ where: { code: newCode } });
    if (!oldNode || !newNode) { console.log("skip", oldCode); continue; }

    const links = await prisma.questionKnowledge.findMany({ where: { nodeId: oldNode.id } });
    let moved = 0, dropped = 0;
    for (const l of links) {
      const exists = await prisma.questionKnowledge.findUnique({
        where: { questionId_nodeId: { questionId: l.questionId, nodeId: newNode.id } },
      });
      if (exists) {
        await prisma.questionKnowledge.delete({ where: { id: l.id } });
        dropped++;
      } else {
        await prisma.questionKnowledge.update({
          where: { id: l.id },
          data: { nodeId: newNode.id, isPrimary: l.isPrimary },
        });
        moved++;
      }
    }
    // 节点若已无子节点/技能/题目，删除
    const count = await prisma.knowledgeNode.findUnique({
      where: { id: oldNode.id },
      include: { _count: { select: { children: true, questionLinks: true, microSkills: true } } },
    });
    if (count && count._count.children === 0 && count._count.questionLinks === 0 && count._count.microSkills === 0) {
      await prisma.knowledgeNode.delete({ where: { id: oldNode.id } });
      console.log(`${oldCode}: 迁移题目 ${moved}，去重 ${dropped}，节点已删除`);
    } else {
      console.log(`${oldCode}: 迁移题目 ${moved}，去重 ${dropped}，节点仍有引用未删除`, count?._count);
    }
  }

  const [k, s, q] = await Promise.all([
    prisma.knowledgeNode.count({ where: { level: "KNOWLEDGE_NODE" } }),
    prisma.microSkill.count(),
    prisma.question.count({ where: { deletedAt: null } }),
  ]);
  console.log({ K节点: k, 微技能: s, 题目: q });
}

main()
  .catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
