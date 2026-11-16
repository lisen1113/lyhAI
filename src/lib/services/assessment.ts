// 诊断与周测服务
import { prisma } from "@/lib/db";
import { gradeAnswer } from "./question";
import { updateMastery } from "./mastery";
import { AttemptOutcome, AssessmentType, AssessmentStatus } from "@prisma/client";

/** 创建一次测验（诊断/周测）*/
export async function createAssessment(params: {
  type: AssessmentType;
  title: string;
  subjectCode?: "PH" | "CH";
  questionCount?: number;
}) {
  const count = params.questionCount ?? 10;
  const questions = await prisma.question.findMany({
    where: {
      reviewStatus: "PUBLISHED", deletedAt: null,
      ...(params.subjectCode ? { subject: { code: params.subjectCode } } : {}),
    },
    take: count,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return prisma.assessment.create({
    data: {
      type: params.type,
      title: params.title,
      status: AssessmentStatus.SCHEDULED,
      questions: {
        create: questions.map((q, i) => ({ questionId: q.id, order: i })),
      },
    },
    include: { questions: { include: { question: true }, orderBy: { order: "asc" } } },
  });
}

/** 提交测验作答，逐题判分并初始化/更新 Mastery */
export async function submitAssessment(params: {
  assessmentId: string;
  studentId: string;
  answers: Array<{ questionId: string; answer: unknown }>;
}) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: params.assessmentId },
    include: { questions: { include: { question: true } } },
  });
  if (!assessment) throw new Error("测验不存在");

  const correctMap: Record<string, boolean> = {};
  let correctCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const aq of assessment.questions) {
      const ans = params.answers.find((a) => a.questionId === aq.questionId);
      const correct = ans ? gradeAnswer(aq.question.type, aq.question.standardAnswer, ans.answer) : false;
      correctMap[aq.questionId] = correct;
      if (correct) correctCount++;

      // 初始化/更新该知识点对应技能掌握度
      const link = await tx.questionKnowledge.findFirst({ where: { questionId: aq.questionId } });
      if (link) {
        const skill = await tx.microSkill.findFirst({ where: { nodeId: link.nodeId }, orderBy: { code: "asc" } });
        if (skill) {
          await updateMastery({
            studentId: params.studentId,
            microSkillId: skill.id,
            nodeId: link.nodeId,
            outcome: correct ? AttemptOutcome.FIRST_TRY_CORRECT : AttemptOutcome.WRONG,
            tx,
          });
        }
      }
    }

    // 保存/更新作答记录
    const existing = await tx.assessmentAttempt.findUnique({
      where: { assessmentId_studentId: { assessmentId: params.assessmentId, studentId: params.studentId } },
    });
    const analysis = {
      total: assessment.questions.length,
      correct: correctCount,
      accuracy: Math.round((correctCount / (assessment.questions.length || 1)) * 100),
      byQuestion: correctMap,
    };
    if (existing) {
      await tx.assessmentAttempt.update({
        where: { id: existing.id },
        data: { answers: params.answers as never, score: correctCount, analysis: analysis as never, completedAt: new Date() },
      });
    } else {
      await tx.assessmentAttempt.create({
        data: {
          assessmentId: params.assessmentId, studentId: params.studentId,
          answers: params.answers as never, score: correctCount, analysis: analysis as never,
          completedAt: new Date(),
        },
      });
    }
    await tx.assessment.update({ where: { id: params.assessmentId }, data: { status: AssessmentStatus.COMPLETED } });
  });

  return {
    total: assessment.questions.length,
    correct: correctCount,
    accuracy: Math.round((correctCount / (assessment.questions.length || 1)) * 100),
  };
}

/** 获取周测/诊断列表 */
export async function listAssessments() {
  return prisma.assessment.findMany({
    include: { _count: { select: { questions: true, attempts: true } } },
    orderBy: { createdAt: "desc" },
  });
}
