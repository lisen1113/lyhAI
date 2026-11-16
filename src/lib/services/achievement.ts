// 成就授予服务 — 依据客观学习数据，授予正向成就（无排名、无负面标签）
import { prisma } from "@/lib/db";

/** 检查并授予学生应得成就，返回本次新授予的成就名 */
export async function grantAchievements(studentId: string): Promise<string[]> {
  const [attempts, sessions, masteries] = await Promise.all([
    prisma.questionAttempt.findMany({ where: { studentId } }),
    prisma.practiceSession.findMany({ where: { studentId, status: "COMPLETED" } }),
    prisma.studentMastery.findMany({ where: { studentId }, include: { microSkill: true } }),
  ]);

  const firstTryCount = attempts.filter((a) => a.outcome === "FIRST_TRY_CORRECT").length;
  const mastered = masteries.filter((m) => m.status === "STABLE" || m.status === "PROFICIENT").length;
  const daySet = new Set(sessions.map((s) => s.startedAt.toISOString().slice(0, 10)));
  const streak = daySet.size;
  const experimentSkills = masteries.filter((m) =>
    m.status !== "NOT_STARTED" && /实验|制取|检验|操作/.test(m.microSkill.name)
  ).length;
  const chemLangSkills = masteries.filter((m) =>
    m.status !== "NOT_STARTED" && /化学式|化合价|元素符号|方程式|配平/.test(m.microSkill.name)
  ).length;

  const metrics: Record<string, number> = {
    streakDays: streak,
    firstMastery: mastered,
    firstTryCount,
    fixedErrors: mastered, // 近似：已掌握技能视为已修复
    experimentSkills,
    chemLangSkills,
  };

  const definitions = await prisma.achievement.findMany();
  const granted: string[] = [];
  for (const def of definitions) {
    const criteria = def.criteria as { type: string; value: number };
    if ((metrics[criteria.type] ?? 0) < criteria.value) continue;
    const existing = await prisma.studentAchievement.findUnique({
      where: { studentId_achievementId: { studentId, achievementId: def.id } },
    });
    if (existing) continue;
    await prisma.studentAchievement.create({
      data: { studentId, achievementId: def.id },
    });
    granted.push(def.name);
  }
  return granted;
}
