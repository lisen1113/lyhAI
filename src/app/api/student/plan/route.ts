import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { getTodayPlan } from "@/lib/services/scheduler";
import { primarySubjectFor } from "@/lib/algorithms/scheduler";
import { SubjectCode } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    const subj = new URL(req.url).searchParams.get("subject");
    const plan = await getTodayPlan(
      user.id,
      subj === "CH" || subj === "PH" ? { subject: subj } : undefined
    );
    // 填充题目/微技能详情供前端展示
    const items = await Promise.all(
      plan.items.map(async (it) => {
        if (it.microSkillId) {
          const sk = await prisma.microSkill.findUnique({
            where: { id: it.microSkillId },
            select: { id: true, code: true, name: true, context: true, coreConcept: true },
          });
          return { ...it, question: null, microSkill: sk };
        }
        if (!it.questionId) return { ...it, question: null, microSkill: null };
        const q = await prisma.question.findUnique({
          where: { id: it.questionId },
          select: {
            id: true, stem: true, type: true, difficulty: true, estimatedTime: true,
            variantLevel: true, isTemplate: true, standardAnswer: true,
          },
        });
        return { ...it, question: q, microSkill: null };
      })
    );
    return NextResponse.json({
      data: {
        id: plan.id, date: plan.date, primarySubject: plan.primarySubject,
        totalMinutes: plan.totalMinutes, status: plan.status, items,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

/** 强制重新生成今日计划（修复选题规则后，让用户能立即看到新计划） */
export async function POST(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    const subj = new URL(req.url).searchParams.get("subject");
    const now = new Date();
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const scheduled = primarySubjectFor(now);
    const target: SubjectCode =
      subj === "CH" || subj === "PH" ? (subj as SubjectCode) : scheduled === "CH" ? SubjectCode.CH : SubjectCode.PH;
    // 只重建目标学科，另一科的计划与进度保持不变
    await prisma.dailyPlan.deleteMany({
      where: { studentId: user.id, date: day, primarySubject: target },
    });
    const plan = await getTodayPlan(user.id, { subject: target });
    return NextResponse.json({ data: { id: plan.id, items: plan.items.length, regenerated: true } });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message } },
      { status: e.code === "UNAUTHORIZED" ? 401 : 403 }
    );
  }
  console.error("[student/plan]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
