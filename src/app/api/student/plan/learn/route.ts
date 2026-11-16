import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  planItemId: z.string().min(1),
});

/**
 * 标记微知识卡已学完（点「我学会了」）。
 * 同时把该微技能写入掌握度表（sampleCount 不变，仅初始化 status 与 lastPracticedAt），
 * 这样即使今天没有做到对应题目，知识地图也能显示「今天学过」。
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole("STUDENT");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "输入无效", details: parsed.error.issues } },
        { status: 400 }
      );
    }

    const item = await prisma.dailyPlanItem.findFirst({
      where: { id: parsed.data.planItemId, plan: { studentId: user.id } },
      include: { microSkill: true },
    });
    if (!item || !item.microSkill) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "学习项不存在" } }, { status: 404 });
    }

    await prisma.dailyPlanItem.update({
      where: { id: item.id },
      data: { completedAt: new Date() },
    });

    // 初始化/更新技能学习痕迹（不改 masteryScore，避免「看一遍就算掌握」）
    const existing = await prisma.studentMastery.findUnique({
      where: { studentId_microSkillId: { studentId: user.id, microSkillId: item.microSkill.id } },
    });
    if (!existing) {
      await prisma.studentMastery.create({
        data: {
          studentId: user.id,
          microSkillId: item.microSkill.id,
          nodeId: item.microSkill.nodeId,
          masteryScore: 5,
          confidenceScore: 50,
          status: "INTRO",
          lastPracticedAt: new Date(),
          nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sampleCount: 0,
        },
      });
    } else {
      await prisma.studentMastery.update({
        where: { id: existing.id },
        data: { lastPracticedAt: new Date() },
      });
    }

    return NextResponse.json({
      data: { ok: true, microSkillId: item.microSkill.id, name: item.microSkill.name },
    });
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
  console.error("[student/plan/learn]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
