// 掌握度服务 — 将算法与 DB 事务集成，保证幂等与可审计
import { Prisma, AttemptOutcome, MasteryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  applyAttempt, INITIAL_MASTERY, statusFromScore,
  type MasteryState, type AttemptOutcome as AlgoOutcome,
} from "@/lib/algorithms/mastery";

const OUTCOME_MAP: Record<AttemptOutcome, AlgoOutcome> = {
  FIRST_TRY_CORRECT: "FIRST_TRY_CORRECT",
  CORRECT_AFTER_HINT_1: "CORRECT_AFTER_HINT_1",
  CORRECT_AFTER_HINT_2: "CORRECT_AFTER_HINT_2",
  CORRECT_AFTER_HINT_3: "CORRECT_AFTER_HINT_3",
  CORRECT_AFTER_SOLUTION: "CORRECT_AFTER_SOLUTION",
  WRONG: "WRONG",
  SKIPPED: "SKIPPED",
};

/**
 * 在一次作答后更新掌握度（须在调用方事务内或自行开启事务）。
 * 保证：读-改-写原子；写 MasteryChangeLog；独立率封顶决定 status。
 */
export async function updateMastery(params: {
  studentId: string;
  microSkillId: string;
  nodeId: string;
  outcome: AttemptOutcome;
  attemptId?: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const { studentId, microSkillId, nodeId } = params;
  const algoOutcome = OUTCOME_MAP[params.outcome];

  const existing = await db.studentMastery.findUnique({
    where: { studentId_microSkillId: { studentId, microSkillId } },
  });

  const state: MasteryState = existing
    ? {
        masteryScore: existing.masteryScore,
        confidenceScore: existing.confidenceScore,
        independentAccuracy: existing.independentAccuracy,
        hintDependency: existing.hintDependency,
        sampleCount: existing.sampleCount,
        recentOutcomes: (existing.recentOutcomes as AlgoOutcome[]) ?? [],
      }
    : { ...INITIAL_MASTERY };

  const result = applyAttempt(state, algoOutcome);
  let status = statusFromScore(result.masteryScore) as MasteryStatus;
  // 独立率封顶：靠提示刷高也不能超过 BASIC
  if (result.cappedByIndependent) status = MasteryStatus.BASIC;

  const nextReviewAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 默认3天，复测模块会覆盖

  if (existing) {
    const updated = await db.studentMastery.update({
      where: { id: existing.id },
      data: {
        masteryScore: result.masteryScore,
        confidenceScore: result.confidenceScore,
        independentAccuracy: result.independentAccuracy,
        hintDependency: result.hintDependency,
        sampleCount: result.sampleCount,
        recentOutcomes: result.recentOutcomes as never,
        status,
        lastPracticedAt: new Date(),
        nextReviewAt,
      },
    });
    await db.masteryChangeLog.create({
      data: {
        masteryId: updated.id,
        oldScore: existing.masteryScore,
        newScore: result.masteryScore,
        reason: "attempt",
        attemptId: params.attemptId ?? null,
      },
    });
    return updated;
  }

  const created = await db.studentMastery.create({
    data: {
      studentId, microSkillId, nodeId,
      masteryScore: result.masteryScore,
      confidenceScore: result.confidenceScore,
      independentAccuracy: result.independentAccuracy,
      hintDependency: result.hintDependency,
      sampleCount: result.sampleCount,
      recentOutcomes: result.recentOutcomes as never,
      status,
      lastPracticedAt: new Date(),
      nextReviewAt,
    },
  });
  await db.masteryChangeLog.create({
    data: {
      masteryId: created.id,
      oldScore: 0,
      newScore: result.masteryScore,
      reason: "attempt",
      attemptId: params.attemptId ?? null,
    },
  });
  return created;
}

/** 根据使用的最高 Hint 级别与是否正确，推导 AttemptOutcome */
export function decideOutcome(params: {
  correct: boolean;
  maxHintLevel: number;
  sawSolution: boolean;
  skipped: boolean;
}): AttemptOutcome {
  if (params.skipped) return AttemptOutcome.SKIPPED;
  if (!params.correct) return AttemptOutcome.WRONG;
  if (params.sawSolution) return AttemptOutcome.CORRECT_AFTER_SOLUTION;
  if (params.maxHintLevel >= 3) return AttemptOutcome.CORRECT_AFTER_HINT_3;
  if (params.maxHintLevel === 2) return AttemptOutcome.CORRECT_AFTER_HINT_2;
  if (params.maxHintLevel === 1) return AttemptOutcome.CORRECT_AFTER_HINT_1;
  return AttemptOutcome.FIRST_TRY_CORRECT;
}

/** 错因记录（含重复错误预警计数） */
export async function recordError(params: {
  studentId: string;
  errorTagId: string;
  attemptId?: string;
  note?: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  return db.studentError.create({
    data: {
      studentId: params.studentId,
      errorTagId: params.errorTagId,
      attemptId: params.attemptId ?? null,
      note: params.note ?? null,
    },
  });
}

/** 检测某学生某错因在最近 N 次内的重复次数（预警用） */
export async function countRecentErrors(studentId: string, errorTagId: string, withinDays = 7) {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  return prisma.studentError.count({
    where: { studentId, errorTagId, occurredAt: { gte: since } },
  });
}
