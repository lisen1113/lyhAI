import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  attemptId: z.string().min(1),
  errorTagIds: z.array(z.string().min(1)).max(5),
  note: z.string().max(200).optional(),
});

/**
 * 错因自诊：答错后由学生勾选「卡在哪」，写入 StudentError。
 * 幂等：同一 attempt + tag 不重复写入。仅错误/跳过作答可记录。
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
    const { attemptId, errorTagIds, note } = parsed.data;

    const attempt = await prisma.questionAttempt.findFirst({
      where: { id: attemptId, studentId: user.id },
      select: { id: true, correct: true, questionId: true },
    });
    if (!attempt) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "答题记录不存在" } }, { status: 404 });
    }
    if (attempt.correct) {
      return NextResponse.json(
        { error: { code: "NOT_APPLICABLE", message: "答对的题目不需要记录错因" } },
        { status: 400 }
      );
    }

    const existing = await prisma.studentError.findMany({
      where: { attemptId, studentId: user.id },
      select: { errorTagId: true },
    });
    const existingIds = new Set(existing.map((e) => e.errorTagId));

    let created = 0;
    for (const tagId of errorTagIds) {
      if (existingIds.has(tagId)) continue;
      await prisma.studentError.create({
        data: {
          studentId: user.id,
          errorTagId: tagId,
          attemptId,
          note: note ?? null,
        },
      });
      created++;
    }

    // 重复错误预警：同一标签近 7 天出现 3 次以上，返回提示（学生端中性表达）
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const counts = await prisma.studentError.groupBy({
      by: ["errorTagId"],
      where: { studentId: user.id, occurredAt: { gte: since }, errorTagId: { in: errorTagIds } },
      _count: true,
    });
    const repeated = counts.filter((c) => c._count >= 3).map((c) => c.errorTagId);

    return NextResponse.json({ data: { ok: true, created, repeatedTagIds: repeated } });
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
  console.error("[student/attempt/error]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
