// 复测服务 — 将复测算法与 DB 集成
import { Prisma, AttemptOutcome } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyReview, INITIAL_REVIEW, type ReviewOutcome } from "@/lib/algorithms/review";
import { DEFAULT_CONFIG } from "@/lib/config";

const OUTCOME_MAP: Partial<Record<AttemptOutcome, ReviewOutcome>> = {
  FIRST_TRY_CORRECT: "FIRST_TRY_CORRECT",
  CORRECT_AFTER_HINT_1: "CORRECT_AFTER_HINT_1",
  CORRECT_AFTER_HINT_2: "CORRECT_AFTER_HINT_2",
  CORRECT_AFTER_HINT_3: "CORRECT_AFTER_HINT_3",
  WRONG: "WRONG",
  SKIPPED: "SKIPPED",
};

/** 作答后更新复测计划 */
export async function updateReviewSchedule(params: {
  studentId: string;
  microSkillId: string;
  nodeId: string;
  outcome: AttemptOutcome;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const algoOutcome = OUTCOME_MAP[params.outcome];
  if (!algoOutcome) return null; // CORRECT_AFTER_SOLUTION 不单独推进复测

  const existing = await db.reviewSchedule.findUnique({
    where: { studentId_microSkillId: { studentId: params.studentId, microSkillId: params.microSkillId } },
  });
  const state = existing
    ? { stage: existing.stage, boost: existing.boost, consecutiveFails: existing.consecutiveFails, remedial: existing.remedial }
    : { ...INITIAL_REVIEW };

  const result = applyReview(state, algoOutcome);
  const nextReviewAt = new Date(Date.now() + result.daysUntilReview * 24 * 60 * 60 * 1000);

  if (existing) {
    return db.reviewSchedule.update({
      where: { id: existing.id },
      data: {
        stage: result.stage, boost: result.boost,
        consecutiveFails: result.consecutiveFails, remedial: result.remedial,
        nextReviewAt,
      },
    });
  }
  return db.reviewSchedule.create({
    data: {
      studentId: params.studentId, microSkillId: params.microSkillId, nodeId: params.nodeId,
      stage: result.stage, boost: result.boost,
      consecutiveFails: result.consecutiveFails, remedial: result.remedial,
      nextReviewAt,
    },
  });
}

/** 获取到期复测列表 */
export async function getDueReviews(studentId: string) {
  return prisma.reviewSchedule.findMany({
    where: { studentId, nextReviewAt: { lte: new Date() } },
    include: { microSkill: true, node: true },
    orderBy: { nextReviewAt: "asc" },
  });
}

/** 同步掌握度的 nextReviewAt（作答后调用） */
export async function syncMasteryNextReview(params: {
  studentId: string; microSkillId: string; nextReviewAt: Date; tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  await db.studentMastery.updateMany({
    where: { studentId: params.studentId, microSkillId: params.microSkillId },
    data: { nextReviewAt: params.nextReviewAt },
  });
}
