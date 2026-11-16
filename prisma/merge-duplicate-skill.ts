// 合并重复微技能：PH-M07-U02-K03-S02 → PH-M07-U01-K02-S01
// 逐条处理唯一约束冲突（ReviewSchedule / StudentMastery）
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dup = process.argv[2];
  const target = process.argv[3];
  if (!dup || !target) { console.log("usage: tsx merge-duplicate-skill.ts <dupCode> <targetCode>"); return; }
  const d = await prisma.microSkill.findUnique({ where: { code: dup }, include: { node: true } });
  const t = await prisma.microSkill.findUnique({ where: { code: target } });
  if (!d || !t) { console.log("skip: not found"); return; }

  await prisma.question.updateMany({ where: { microSkillId: d.id }, data: { microSkillId: t.id } });

  // 掌握度：目标已有则合并后删除源记录
  const dm = await prisma.studentMastery.findMany({ where: { microSkillId: d.id } });
  for (const m of dm) {
    const exist = await prisma.studentMastery.findUnique({
      where: { studentId_microSkillId: { studentId: m.studentId, microSkillId: t.id } },
    });
    if (exist) {
      // 保留分数更高的一条
      if (m.masteryScore > exist.masteryScore) {
        await prisma.studentMastery.update({
          where: { id: exist.id },
          data: {
            masteryScore: m.masteryScore, sampleCount: m.sampleCount,
            independentAccuracy: m.independentAccuracy, hintDependency: m.hintDependency,
            status: m.status,
          },
        });
      }
      await prisma.masteryChangeLog.updateMany({ where: { masteryId: m.id }, data: { masteryId: exist.id } });
      await prisma.studentMastery.delete({ where: { id: m.id } });
    } else {
      await prisma.studentMastery.update({
        where: { id: m.id }, data: { microSkillId: t.id, nodeId: t.nodeId },
      });
    }
  }

  // 复测计划：同样处理冲突
  const rs = await prisma.reviewSchedule.findMany({ where: { microSkillId: d.id } });
  for (const r of rs) {
    const exist = await prisma.reviewSchedule.findFirst({
      where: { studentId: r.studentId, microSkillId: t.id },
    });
    if (exist) {
      await prisma.reviewSchedule.delete({ where: { id: r.id } });
    } else {
      await prisma.reviewSchedule.update({
        where: { id: r.id }, data: { microSkillId: t.id, nodeId: t.nodeId },
      });
    }
  }

  await prisma.dailyPlanItem.updateMany({ where: { microSkillId: d.id }, data: { microSkillId: t.id } });
  await prisma.microSkill.delete({ where: { id: d.id } });
  console.log("合并完成，已删除", dup);

  const n = await prisma.knowledgeNode.findUnique({
    where: { code: d.node.code },
    include: { _count: { select: { children: true, questionLinks: true, microSkills: true } } },
  });
  if (n && n._count.children === 0 && n._count.questionLinks === 0 && n._count.microSkills === 0) {
    await prisma.knowledgeNode.delete({ where: { id: n.id } });
    console.log("已删除孤立节点", d.node.code);
  }
  console.log("微技能总数", await prisma.microSkill.count());
}

main()
  .catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
