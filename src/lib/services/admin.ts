// 管理员数据服务 — 只看结果
import { prisma } from "@/lib/db";

/** 验收脚本专用账号的用户名前缀（见 scripts/lib-verify-student.ts） */
const VERIFY_PREFIX = "__verify";

/**
 * 列出真实学生（排除验收脚本用的测试账号）。
 * 注意不能用 username startsWith "__" 过滤：SQL 的 LIKE 里下划线是单字符通配符，
 * `__%` 会匹配任意两个字符开头的用户名，等于把所有学生都排除掉。
 */
export async function listRealStudents() {
  const verifyUsers = await prisma.user.findMany({
    // 用精确匹配而不是 startsWith，避免 SQL LIKE 把 "_" 当通配符
    where: { username: VERIFY_PREFIX },
    select: { id: true },
  });
  return prisma.user.findMany({
    where: { role: "STUDENT", id: { notIn: verifyUsers.map((u) => u.id) } },
    include: { studentProfile: true },
    orderBy: { username: "asc" },
  });
}

/** 单学生的关键指标 */
export async function getStudentMetrics(studentId: string) {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [attempts, sessions, masteries, errors] = await Promise.all([
    prisma.questionAttempt.findMany({ where: { studentId }, orderBy: { submittedAt: "desc" }, take: 500 }),
    prisma.practiceSession.findMany({ where: { studentId }, orderBy: { startedAt: "desc" }, take: 500 }),
    prisma.studentMastery.findMany({ where: { studentId }, include: { node: true, microSkill: true } }),
    prisma.studentError.findMany({ where: { studentId }, include: { errorTag: true }, orderBy: { occurredAt: "desc" }, take: 500 }),
  ]);

  const firstTry = attempts.filter((a) => a.outcome === "FIRST_TRY_CORRECT").length;
  const hintCount = attempts.filter((a) => a.outcome.startsWith("CORRECT_AFTER_HINT")).length;
  const independentRate = attempts.length ? Math.round((firstTry / attempts.length) * 100) : 0;
  const hintDependency = attempts.length ? Math.round((hintCount / attempts.length) * 100) : 0;

  // 学科 ID（先查询，供 masteryOf 使用）
  const ph = await prisma.subject.findUnique({ where: { code: "PH" } });
  const ch = await prisma.subject.findUnique({ where: { code: "CH" } });
  const phId = ph?.id ?? "";
  const chId = ch?.id ?? "";

  const masteryOf = (subjectCode: string) => {
    const list = masteries.filter((m) => m.node.subjectId === (subjectCode === "PH" ? phId : chId));
    return list.length ? Math.round(list.reduce((a, m) => a + m.masteryScore, 0) / list.length) : 0;
  };

  const weak = masteries.filter((m) => m.masteryScore < 60)
    .sort((a, b) => a.masteryScore - b.masteryScore).slice(0, 3)
    .map((m) => m.microSkill.name);

  // 重复错误（同一错因出现>=2）
  const tagCount: Record<string, number> = {};
  errors.forEach((e) => { tagCount[e.errorTagId] = (tagCount[e.errorTagId] ?? 0) + 1; });
  const repeated = errors.filter((e) => tagCount[e.errorTagId] >= 2)
    .filter((e, i, arr) => arr.findIndex((x) => x.errorTagId === e.errorTagId) === i)
    .map((e) => e.errorTag.name);

  const today = new Date().toISOString().slice(0, 10);
  const todayDone = sessions.filter((s) => s.startedAt.toISOString().slice(0, 10) === today).length;
  const weekDays = new Set(sessions.filter((s) => s.startedAt >= since7d).map((s) => s.startedAt.toISOString().slice(0, 10))).size;
  const effectiveMinutes = Math.round(sessions.reduce((a, s) => {
    if (!s.endedAt) return a;
    return a + (s.endedAt.getTime() - s.startedAt.getTime()) / 60000;
  }, 0));

  // 一模准备度：综合掌握度与独立率
  const avgMastery = masteries.length ? masteries.reduce((a, m) => a + m.masteryScore, 0) / masteries.length : 0;
  const readiness = Math.round(avgMastery * 0.6 + independentRate * 0.4);

  return {
    todayDone, weekDays, effectiveMinutes,
    physicsMastery: masteryOf("PH"), chemistryMastery: masteryOf("CH"),
    independentRate, hintDependency, weak, repeated, readiness,
    totalAttempts: attempts.length,
  };
}

/** 知识热力图数据（学生×节点掌握度） */
export async function getKnowledgeHeatmap(studentId: string) {
  const masteries = await prisma.studentMastery.findMany({
    where: { studentId }, include: { node: true },
  });
  return masteries.map((m) => ({
    code: m.node.code, name: m.node.name, score: Math.round(m.masteryScore), status: m.status,
  }));
}

/** 趋势数据（按天的独立率） */
export async function getTrends(studentId: string) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { studentId }, orderBy: { submittedAt: "asc" },
  });
  const byDay: Record<string, { total: number; first: number; hint: number }> = {};
  attempts.forEach((a) => {
    const d = a.submittedAt.toISOString().slice(0, 10);
    if (!byDay[d]) byDay[d] = { total: 0, first: 0, hint: 0 };
    byDay[d].total++;
    if (a.outcome === "FIRST_TRY_CORRECT") byDay[d].first++;
    if (a.outcome.startsWith("CORRECT_AFTER_HINT")) byDay[d].hint++;
  });
  return Object.entries(byDay).map(([date, v]) => ({
    date,
    independent: Math.round((v.first / v.total) * 100),
    hint: Math.round((v.hint / v.total) * 100),
  }));
}
