// DailyPlan 调度服务 — 30分钟六段、主科交替、优先级、前置门控、变式阶梯
// 选题原则：排除学生已作答题目 + 基于日期的确定性轮换，保证跨天不重复、同日幂等
//
// 变式阶梯的组织方式（重要）：
//   教材的一个「单元」本身就是一个知识簇（如 密度的概念→测量→应用）。
//   当某个微技能题量不足以支撑 3 层时，阶梯在「同单元」内展开，
//   而不是用无关知识点的题凑数，也不假装是同一道题的变式。
import { prisma } from "@/lib/db";
import {
  computePriority, primarySubjectFor, difficultyDecision, defaultBudget,
} from "@/lib/algorithms/scheduler";
import { SubjectCode, PlanSegment, PlanStatus, PrereqStrength } from "@prisma/client";

/** 稳定哈希：把字符串映射为整数，用于确定性轮换（同一输入永远同一输出） */
function stableHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 确定性打乱：基于 seed 对题目ID排序（不用 Math.random，保证同日幂等、跨天轮换） */
function rotateBySeed<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((a, b) => stableHash(a.id + "|" + seed) - stableHash(b.id + "|" + seed));
}

/** 学生已作答过的题目ID（含所有历史，避免热身/训练重复） */
async function answeredQuestionIds(studentId: string): Promise<Set<string>> {
  const attempts = await prisma.questionAttempt.findMany({
    where: { studentId }, select: { questionId: true },
  });
  return new Set(attempts.map((a) => a.questionId));
}

/**
 * 从候选池选题：优先未作答题目；按 seed 确定性轮换；
 * 穿过整份计划的 used 集合避免段内重复；题库不足时回退到已作答题目。
 */
function selectFrom(
  pool: Array<{ id: string }>,
  answered: Set<string>,
  used: Set<string>,
  seed: string,
  count: number
): string[] {
  const fresh = rotateBySeed(pool.filter((q) => !answered.has(q.id) && !used.has(q.id)), seed);
  const chosen = fresh.slice(0, count).map((q) => q.id);
  if (chosen.length >= count) return chosen;
  const rest = rotateBySeed(pool.filter((q) => !used.has(q.id) && !chosen.includes(q.id)), seed + "-fill");
  for (const q of rest) {
    if (chosen.length >= count) break;
    chosen.push(q.id);
  }
  return chosen;
}

/** 学习状态快照：每个微技能的掌握度 + 前置是否满足 + 最近是否学过 */
export async function buildSkillStates(studentId: string, subjectCode: SubjectCode) {
  const nodes = await prisma.knowledgeNode.findMany({
    where: { level: "KNOWLEDGE_NODE", subject: { code: subjectCode } },
    include: {
      microSkills: true,
      parent: { select: { parentId: true } },
      prereqs: { include: { prerequisiteNode: { include: { microSkills: true } } } },
    },
  });
  const masteries = await prisma.studentMastery.findMany({ where: { studentId } });
  const bySkill = new Map(masteries.map((m) => [m.microSkillId, m]));

  return nodes.map((node) => {
    const skill = node.microSkills[0];
    const m = skill ? bySkill.get(skill.id) : undefined;
    // 前置：任一前置节点对应技能掌握度低于 40，视为未满足（SOFT 仅降权，HARD 直接阻断）
    let hardBlocked = false;
    let unmetSoft = 0;
    for (const p of node.prereqs) {
      const pSkill = p.prerequisiteNode.microSkills[0];
      const pMastery = pSkill ? bySkill.get(pSkill.id)?.masteryScore ?? 0 : 0;
      if (pMastery < 40) {
        if (p.strength === PrereqStrength.HARD) hardBlocked = true;
        else unmetSoft++;
      }
    }
    const daysSince = m?.lastPracticedAt
      ? (Date.now() - m.lastPracticedAt.getTime()) / 86400000
      : 999;
    return {
      nodeId: node.id,
      nodeName: node.name,
      unitId: node.parentId, // 所属单元：变式阶梯的最小组织单位
      moduleId: node.parent?.parentId ?? null, // 所属模块：单元题量不足时的次选范围
      skillId: skill?.id ?? null,
      skillCode: skill?.code ?? null,
      skillName: skill?.name ?? null,
      examWeight: skill?.examWeight ?? node.examWeight,
      repairability: skill?.repairability ?? node.repairability,
      masteryScore: m?.masteryScore ?? 0,
      hintDependency: m?.hintDependency ?? 0,
      nextReviewAt: m?.nextReviewAt ?? null,
      sampleCount: m?.sampleCount ?? 0,
      hardBlocked,
      unmetSoft,
      prereqSatisfied: !hardBlocked && unmetSoft === 0,
      daysSince,
      isNew: !m || m.sampleCount === 0,
    };
  });
}

/** 为某学生某日生成/获取 DailyPlan（幂等：同日同科已有则复用） */
export async function ensureDailyPlan(studentId: string, date: Date, subjectOverride?: SubjectCode) {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);

  // 默认按星期轮换（周一三五物理 / 周二四六化学），也可由学生手动指定学科补进度
  const scheduled = primarySubjectFor(day);
  const primarySubject: SubjectCode =
    subjectOverride ?? (scheduled === "CH" ? SubjectCode.CH : SubjectCode.PH);

  const existing = await prisma.dailyPlan.findUnique({
    where: { studentId_date_primarySubject: { studentId, date: day, primarySubject } },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (existing) return existing;

  const seed = `${studentId.slice(0, 8)}-${day.toISOString().slice(0, 10)}-${primarySubject}`;

  // 近期独立正确率（近3天）
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recentAttempts = await prisma.questionAttempt.findMany({
    where: { studentId, submittedAt: { gte: since } },
    select: { outcome: true, correct: true },
  });
  const firstTry = recentAttempts.filter((a) => a.outcome === "FIRST_TRY_CORRECT").length;
  const recentRate = recentAttempts.length ? (firstTry / recentAttempts.length) * 100 : 70;
  const difficulty = difficultyDecision(recentRate);

  // 技能状态（含前置门控）
  const states = await buildSkillStates(studentId, primarySubject);
  const scored = states
    .map((s) => ({
      s,
      priority: computePriority({
        examWeight: s.examWeight,
        masteryScore: s.masteryScore,
        repairability: s.repairability,
        reviewUrgency: s.nextReviewAt && s.nextReviewAt <= new Date() ? 1.8 : 1,
        hintDependency: s.hintDependency,
        prereqSatisfied: s.prereqSatisfied,
      }),
    }))
    .filter((x) => !x.s.hardBlocked)
    .sort((a, b) => b.priority - a.priority);

  // 主科已发布题库（整池），带微技能与单元信息
  const primaryPool = await prisma.question.findMany({
    where: { subject: { code: primarySubject }, reviewStatus: "PUBLISHED", deletedAt: null },
    select: {
      id: true, variantLevel: true, isTemplate: true, microSkillId: true,
      microSkill: { select: { code: true, nodeId: true, node: { select: { parentId: true, parent: { select: { parentId: true } } } } } },
    },
  });
  // 「换数字」模板题不进入常态取题池：否则会出现连续三道「质量1kg/2kg/3kg 求重力」
  // 仅在熟练层（掌握度已高）用作保持性练习，见下方 practicePool 的选择
  const usablePool = primaryPool.filter((q) => !q.isTemplate);

  // 单元 → 题量/层级覆盖，用于挑选「今天值得学且练得动」的技能
  const unitStats = new Map<string, { count: number; levels: Set<number> }>();
  const skillStats = new Map<string, { count: number; levels: Set<number>; l2: number; l3: number }>();
  for (const q of usablePool) {
    const unitId = q.microSkill?.node?.parentId ?? "";
    const sid = q.microSkillId ?? "";
    if (unitId) {
      const u = unitStats.get(unitId) ?? { count: 0, levels: new Set<number>() };
      u.count++; u.levels.add(q.variantLevel); unitStats.set(unitId, u);
    }
    if (sid) {
      const s = skillStats.get(sid) ?? { count: 0, levels: new Set<number>(), l2: 0, l3: 0 };
      s.count++; s.levels.add(q.variantLevel);
      if (q.variantLevel === 2) s.l2++;
      if (q.variantLevel === 3) s.l3++;
      skillStats.set(sid, s);
    }
  }

  const answered = await answeredQuestionIds(studentId);
  const used = new Set<string>();
  const budget = defaultBudget();

  // ---- 微知识：今天只学 1 个新技能 ----
  // 规则：前置满足 + 掌握度<60 + 至少 2 天没碰 + 所在单元有足够题可练
  // 练得动指数：技能自身变式题是否足以支撑「专项 5 题 + 独立 2 题」
  // 学到只有 3 道题的技能，整条链路会散架到别的知识点，这一天就白学了
  const fitScore = (sid?: string | null) => {
    const st = sid ? skillStats.get(sid) : undefined;
    if (!st) return 0;
    if (st.l2 >= 2 && st.l3 >= 2) return 3;
    if (st.l2 + st.l3 >= 3) return 2;
    if (st.l2 + st.l3 >= 2 && st.l3 >= 1) return 1;
    return 0;
  };
  const learnCandidates = scored
    .filter((x) => x.s.skillId && x.s.masteryScore < 60 && x.s.daysSince >= 2)
    .sort((a, b) => {
      const newA = a.s.isNew ? 1 : 0;
      const newB = b.s.isNew ? 1 : 0;
      if (newA !== newB) return newB - newA;
      const fitA = fitScore(a.s.skillId);
      const fitB = fitScore(b.s.skillId);
      if (fitA !== fitB) return fitB - fitA;
      const preA = a.s.unmetSoft === 0 ? 1 : 0;
      const preB = b.s.unmetSoft === 0 ? 1 : 0;
      if (preA !== preB) return preB - preA;
      // 单元题量与层级覆盖：确保「学了马上练得动」
      const ua = a.s.unitId ? unitStats.get(a.s.unitId) : undefined;
      const ub = b.s.unitId ? unitStats.get(b.s.unitId) : undefined;
      const uaScore = (ua?.count ?? 0) + (ua?.levels.size ?? 0) * 2;
      const ubScore = (ub?.count ?? 0) + (ub?.levels.size ?? 0) * 2;
      if (uaScore !== ubScore) return ubScore - uaScore;
      return b.priority - a.priority;
    });
  const learnTarget = learnCandidates[0] ?? scored[0];

  const focusSkillId = learnTarget?.s.skillId ?? null;
  const focusUnitId = learnTarget?.s.unitId ?? null;

  // 次级目标：最紧迫的其它技能（前提是同一单元，保证变式连贯）
  const secondarySkillIds = scored
    .map((x) => x.s)
    .filter((s) => s.skillId && s.skillId !== focusSkillId && (!focusUnitId || s.unitId === focusUnitId))
    .slice(0, 3)
    .map((s) => s.skillId as string);

  // 取题池（同技能 → 同单元 → 同模块），供复测段与专项段共用，保证「学什么练什么」
  // 熟练层（掌握度≥80）允许模板题参与，其余一律只用真实题
  const practicePool = (learnTarget?.s.masteryScore ?? 0) >= 80 ? primaryPool : usablePool;
  const focusSkillPool = focusSkillId ? practicePool.filter((q) => q.microSkillId === focusSkillId) : [];
  const focusUnitPool = focusUnitId
    ? practicePool.filter((q) => q.microSkill?.node?.parentId === focusUnitId)
    : [];
  const focusModuleId = learnTarget?.s.moduleId ?? null;
  const focusModulePool = focusModuleId
    ? practicePool.filter((q) => q.microSkill?.node?.parent?.parentId === focusModuleId)
    : [];
  const secondaryPool = secondarySkillIds.length
    ? practicePool.filter((q) => q.microSkillId && secondarySkillIds.includes(q.microSkillId))
    : [];
  const scopes = [focusSkillPool, focusUnitPool, secondaryPool, focusModulePool].filter((p) => p.length > 0);

  const items: Array<{
    segment: PlanSegment; order: number; questionId?: string; microSkillId?: string;
    plannedMinutes: number; boost?: boolean;
  }> = [];

  const pushQuestions = (segment: PlanSegment, ids: string[], minutesEach: number) => {
    ids.forEach((qid) => {
      items.push({ segment, order: items.length, questionId: qid, plannedMinutes: minutesEach });
      used.add(qid);
    });
  };

  // 1 成功热身：已掌握节点的题；没有任何掌握时，从最基础模块的原型题开始
  const strongNodeIds = scored.filter((x) => x.s.masteryScore >= 60).map((x) => x.s.nodeId);
  let warmPool = usablePool.filter((q) => q.variantLevel === 1);
  if (strongNodeIds.length) {
    const strongQ = await prisma.question.findMany({
      where: {
        subject: { code: primarySubject }, reviewStatus: "PUBLISHED", deletedAt: null,
        knowledgeLinks: { some: { nodeId: { in: strongNodeIds } } },
      },
      select: {
        id: true, variantLevel: true, isTemplate: true, microSkillId: true,
        microSkill: { select: { code: true, nodeId: true, node: { select: { parentId: true, parent: { select: { parentId: true } } } } } },
      },
    });
    if (strongQ.length) warmPool = strongQ.filter((q) => q.variantLevel <= 2 && !q.isTemplate);
  } else {
    // 零基础：按技能编码排序取最前面的基础题，避免一上来遇到电学综合
    warmPool = [...warmPool].sort((a, b) =>
      (a.microSkill?.code ?? "").localeCompare(b.microSkill?.code ?? "")
    ).slice(0, 10);
  }
  const warmIds = selectFrom(warmPool.length ? warmPool : usablePool, answered, used, seed + "-warm", 2);
  pushQuestions(PlanSegment.WARMUP, warmIds, 1);

  // 2 到期复测：优先同知识点、同变式组题
  const dueReviews = await prisma.reviewSchedule.findMany({
    where: { studentId, nextReviewAt: { lte: new Date() } },
    take: 3, orderBy: { nextReviewAt: "asc" },
  });
  for (const rv of dueReviews) {
    const vpool = await prisma.question.findMany({
      where: {
        knowledgeLinks: { some: { nodeId: rv.nodeId } },
        reviewStatus: "PUBLISHED", deletedAt: null,
      },
      select: {
        id: true, variantLevel: true, isTemplate: true, microSkillId: true,
        microSkill: { select: { code: true, nodeId: true, node: { select: { parentId: true, parent: { select: { parentId: true } } } } } },
      },
    });
    const preferred = vpool.filter((q) => q.variantLevel >= 2);
    const ids = selectFrom(preferred.length ? preferred : vpool, answered, used, seed + "-rv-" + rv.nodeId, 1);
    if (ids[0]) {
      items.push({ segment: PlanSegment.REVIEW, order: items.length, questionId: ids[0], plannedMinutes: 1, boost: rv.boost });
      used.add(ids[0]);
    }
  }
  // 六段结构固定：无到期复测时用一道变式题填充复测段（预防性复测）
  // 取题必须落在「今日同一单元」内：曾出现零基础学生「学重力、却被复习滑动变阻器」
  if (!items.some((it) => it.segment === PlanSegment.REVIEW)) {
    const brotherPool = focusUnitPool.filter((q) => q.microSkillId !== focusSkillId);
    const fillScopes = [
      brotherPool.filter((q) => q.variantLevel >= 2),
      focusUnitPool.filter((q) => q.variantLevel >= 2),
      focusModulePool.filter((q) => q.variantLevel >= 2),
      focusSkillPool.filter((q) => q.variantLevel >= 2),
      practicePool.filter((q) => q.variantLevel >= 2),
    ].filter((pool) => pool.length > 0);
    const ids = selectFrom(fillScopes[0] ?? practicePool, answered, used, seed + "-rv-fill", 1);
    if (ids[0]) {
      items.push({ segment: PlanSegment.REVIEW, order: items.length, questionId: ids[0], plannedMinutes: 1 });
      used.add(ids[0]);
    }
  }

  // 3 微知识：1 个新技能
  if (learnTarget?.s.skillId) {
    items.push({
      segment: PlanSegment.MICRO_LEARN, order: items.length,
      microSkillId: learnTarget.s.skillId, plannedMinutes: budget.MICRO_LEARN,
    });
  } else {
    const firstSkill = await prisma.microSkill.findFirst({
      where: { node: { subject: { code: primarySubject } } }, orderBy: { code: "asc" },
    });
    if (firstSkill) items.push({ segment: PlanSegment.MICRO_LEARN, order: items.length, microSkillId: firstSkill.id, plannedMinutes: budget.MICRO_LEARN });
  }

  // 4 专项训练：原型 → 轻变式 → 情境变式
  // 严格不跨模块：同技能 → 同单元 → 同模块。宁可少一道题，也不让学生「学电功、练浮力」
  const practiceCount = difficulty === "DECREASE" ? 4 : difficulty === "INCREASE" ? 6 : 5;
  const ladder: number[] = practiceCount === 4 ? [1, 2, 2, 3] : practiceCount === 6 ? [1, 1, 2, 2, 3, 3] : [1, 2, 2, 3, 3];

  const practiceIds: string[] = [];
  const pickAt = (level: number) => {
    for (const pool of scopes) {
      const exact = pool.filter((q) => q.variantLevel === level && !used.has(q.id) && !practiceIds.includes(q.id));
      if (!exact.length) continue;
      const fresh = exact.filter((q) => !answered.has(q.id));
      const picked = selectFrom(fresh.length ? fresh : exact, answered, used, seed + `-p${level}`, 1)[0];
      if (picked) return picked;
    }
    return undefined;
  };

  for (const level of ladder) {
    if (practiceIds.length >= practiceCount) break;
    let picked = pickAt(level);
    if (!picked) {
      // 就近回退：优先更低层级（不跳级），再向上
      for (const alt of [level - 1, level + 1, 1, 2, 3]) {
        if (alt < 1 || alt > 3) continue;
        picked = pickAt(alt);
        if (picked) break;
      }
    }
    if (picked) {
      practiceIds.push(picked);
      used.add(picked);
    }
  }
  pushQuestions(PlanSegment.PRACTICE, practiceIds, Math.ceil(budget.PRACTICE / Math.max(1, practiceCount)));

  // 5 独立通关：2 题，仅取变式层级 >=2（验证迁移而非重复熟练）
  const indepScopes = [focusSkillPool, focusUnitPool, secondaryPool, focusModulePool];
  const indepIds: string[] = [];
  // 轮1：今日范围内的变式题（L2/L3）；轮2：今日范围内的原型题；轮3：全池兜底
  const rounds: Array<{ pools: typeof indepScopes; minLevel: number; tag: string }> = [
    { pools: indepScopes.slice(0, 2), minLevel: 2, tag: "v1" },   // 今日技能/单元内的变式
    { pools: [focusModulePool], minLevel: 2, tag: "v2" },          // 同模块变式
    { pools: indepScopes.slice(0, 2), minLevel: 1, tag: "b1" },    // 同单元原型题兜底
    { pools: [focusModulePool], minLevel: 1, tag: "b2" },
  ];
  for (const r of rounds) {
    for (const pool of r.pools) {
      if (indepIds.length >= 2) break;
      const cand = pool.filter((q) => q.variantLevel >= r.minLevel);
      if (!cand.length) continue;
      const got = selectFrom(cand, answered, used, seed + "-indep-" + r.tag, 2 - indepIds.length);
      for (const id of got) {
        if (indepIds.includes(id)) continue;
        indepIds.push(id);
        used.add(id); // 立即占位，避免后续轮次抽到同一题
      }
    }
    if (indepIds.length >= 2) break;
  }
  pushQuestions(PlanSegment.INDEPENDENT, indepIds, 2);

  // 6 今日总结
  items.push({ segment: PlanSegment.SUMMARY, order: items.length, plannedMinutes: budget.SUMMARY });

  const totalMinutes = items.reduce((a, it) => a + it.plannedMinutes, 0);
  const clamped = Math.min(35, Math.max(25, totalMinutes));

  const plan = await prisma.dailyPlan.create({
    data: {
      studentId, date: day, primarySubject, totalMinutes: clamped,
      status: PlanStatus.ACTIVE,
      items: { create: items },
    },
    include: { items: { orderBy: { order: "asc" } } },
  });
  return plan;
}

/** 获取今日计划（可按学科切换，用于补进度） */
export async function getTodayPlan(
  studentId: string,
  opts?: { date?: Date; subject?: SubjectCode }
) {
  return ensureDailyPlan(studentId, opts?.date ?? new Date(), opts?.subject);
}
