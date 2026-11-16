// 训练引擎服务 — PracticeSession / Attempt / Hint / 判分 / 掌握度，全链路事务与幂等
import { prisma } from "@/lib/db";
import { gradeAnswer, getQuestionById } from "./question";
import { updateMastery, decideOutcome } from "./mastery";
import { AttemptOutcome, Prisma } from "@prisma/client";

export class TrainingError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** 开始一次训练会话 */
export async function startSession(studentId: string, planId?: string) {
  return prisma.practiceSession.create({
    data: { studentId, planId: planId ?? null, status: "IN_PROGRESS" },
  });
}

/** 获取会话详情（含已作答记录，支持断点恢复） */
export async function getSession(sessionId: string, studentId: string) {
  const session = await prisma.practiceSession.findFirst({
    where: { id: sessionId, studentId },
    include: {
      attempts: {
        include: { hintsUsed: { orderBy: { level: "asc" } }, steps: true },
        orderBy: { submittedAt: "asc" },
      },
    },
  });
  if (!session) throw new TrainingError("NOT_FOUND", "会话不存在");
  return session;
}

/**
 * 提交作答（核心闭环）。
 * 幂等：同一 idempotencyKey 重复提交返回首次结果，不重复加分。
 * 事务：Attempt + Hint + Mastery + ChangeLog 原子写入。
 */
export async function submitAttempt(params: {
  studentId: string;
  sessionId: string;
  questionId: string;
  answer: unknown;
  timeSpentSec?: number;
  maxHintLevel: number;
  sawSolution: boolean;
  skipped?: boolean;
  idempotencyKey: string;
  errorTagIds?: string[];
  steps?: Array<{ stepIndex: number; answer: string; correct: boolean }>;
  planItemId?: string;
}) {
  const { studentId, sessionId, questionId, idempotencyKey } = params;

  // 1. 幂等检查
  const dup = await prisma.questionAttempt.findUnique({ where: { idempotencyKey } });
  if (dup) {
    const q = await getQuestionById(questionId);
    return {
      attempt: dup, alreadySubmitted: true, correct: dup.correct, created: false,
      outcome: dup.outcome, standardAnswer: q?.standardAnswer ?? "", solution: q?.solution ?? "",
      attemptId: dup.id,
      masterySkillId: null,
      errorOptions: (q?.errorTags ?? []).map((et) => ({
        id: et.errorTag.id, code: et.errorTag.code, name: et.errorTag.name, category: et.errorTag.category,
      })),
      knowledgeNode: q?.knowledgeLinks?.[0]?.node?.name ?? "",
    };
  }

  // 2. 校验会话归属与状态
  const session = await prisma.practiceSession.findFirst({ where: { id: sessionId, studentId } });
  if (!session) throw new TrainingError("NOT_FOUND", "会话不存在");
  if (session.status !== "IN_PROGRESS") throw new TrainingError("SESSION_CLOSED", "会话已结束");

  const question = await getQuestionById(questionId);
  if (!question) throw new TrainingError("NOT_FOUND", "题目不存在");

  // 3. 判分
  const correct = params.skipped
    ? false
    : gradeAnswer(question.type, question.standardAnswer, params.answer, question.options);

  const outcome = params.skipped
    ? AttemptOutcome.SKIPPED
    : decideOutcome({ correct, maxHintLevel: params.maxHintLevel, sawSolution: params.sawSolution, skipped: false });

  // 4. 找 MicroSkill / nodeId
  const primaryLink = question.knowledgeLinks.find((l) => l.isPrimary) ?? question.knowledgeLinks[0];

  // 5. 事务写入（并发安全：捕获 P2002 后回退读取已存在记录，保证幂等）
  let result: { attempt: Awaited<ReturnType<typeof prisma.questionAttempt.create>>; correct: boolean; created: boolean };
  let masterySkillId: string | null = null;
  try {
    result = await prisma.$transaction(async (tx) => {
    // 二次幂等检查（常规串行路径）
    const dup2 = await tx.questionAttempt.findUnique({ where: { idempotencyKey } });
    if (dup2) return { attempt: dup2, correct: dup2.correct, created: false };

    const attempt = await tx.questionAttempt.create({
      data: {
        sessionId, studentId, questionId,
        outcome, correct,
        answer: params.answer as never,
        idempotencyKey,
        timeSpentSec: params.timeSpentSec ?? 0,
      },
    });

    // 记录已使用的 Hint
    for (let lv = 1; lv <= params.maxHintLevel; lv++) {
      await tx.attemptHint.create({
        data: { attemptId: attempt.id, level: lv, source: "FIXED" },
      });
    }

    // 分步作答
    if (params.steps?.length) {
      for (const st of params.steps) {
        await tx.attemptStep.create({
          data: { attemptId: attempt.id, stepIndex: st.stepIndex, answer: st.answer, correct: st.correct },
        });
      }
    }

    // 错因（仅在错误时记录）
    if (!correct && params.errorTagIds?.length) {
      for (const tagId of params.errorTagIds) {
        await tx.studentError.create({
          data: { studentId, errorTagId: tagId, attemptId: attempt.id },
        });
      }
    }

    // 掌握度更新（事务内）
    if (primaryLink && primaryLink.node) {
      // 优先使用题目直接归属的微技能（108 个 K 节点与 108 个微技能一一对应）
      const skillId =
        question.microSkillId ??
        (await tx.microSkill.findFirst({ where: { nodeId: primaryLink.nodeId }, orderBy: { code: "asc" } }))?.id;
      const skill = skillId ? { id: skillId } : null;
      if (skill) {
        const updatedMastery = await updateMastery({
          studentId, microSkillId: skill.id, nodeId: primaryLink.nodeId,
          outcome, attemptId: attempt.id, tx,
        });
        // 复测调度：作答后更新间隔复测计划，并同步 nextReviewAt 到掌握度
        const { updateReviewSchedule } = await import("./review");
        const schedule = await updateReviewSchedule({
          studentId, microSkillId: skill.id, nodeId: primaryLink.nodeId, outcome, tx,
        });
        if (schedule) {
          await tx.studentMastery.update({
            where: { id: updatedMastery.id },
            data: { nextReviewAt: schedule.nextReviewAt },
          });
        }
        masterySkillId = skill.id;
      }
    }

    // 标记计划项完成（用于今日总结的六段完成度）
    if (params.planItemId) {
      await tx.dailyPlanItem.update({
        where: { id: params.planItemId },
        data: { completedAt: new Date() },
      }).catch(() => undefined);
    }

    return { attempt, correct, created: true };
    });
  } catch (e) {
    // 并发竞态：两个请求同时通过幂等检查，其中一个 create 触发唯一约束冲突。
    // 捕获后回退读取已由对方创建的记录，返回幂等结果，避免 500。
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing =
        (await prisma.questionAttempt.findUnique({ where: { idempotencyKey } })) ??
        (await prisma.questionAttempt.findFirst({ where: { studentId, questionId, sessionId } }));
      if (existing) {
        result = { attempt: existing, correct: existing.correct, created: false };
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  return {
    ...result,
    alreadySubmitted: !result.created,
    standardAnswer: question.standardAnswer,
    solution: question.solution,
    outcome,
    attemptId: result.attempt.id,
    masterySkillId,
    // 供前端「错因自诊」使用：只给本题相关标签，避免学生面对 28 个标签无从下手
    errorOptions: (question.errorTags ?? []).map((et) => ({
      id: et.errorTag.id, code: et.errorTag.code, name: et.errorTag.name, category: et.errorTag.category,
    })),
    knowledgeNode: primaryLink?.node?.name ?? "",
  };
}

/** 结束会话 */
export async function endSession(sessionId: string, studentId: string, feedback?: "EASY" | "JUST_RIGHT" | "HARD") {
  const session = await prisma.practiceSession.findFirst({ where: { id: sessionId, studentId } });
  if (!session) throw new TrainingError("NOT_FOUND", "会话不存在");
  return prisma.practiceSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", endedAt: new Date(), ...(feedback ? { feedback } : {}) },
  });
}
