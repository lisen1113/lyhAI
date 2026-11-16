import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { explain } from "@/lib/ai/tutor";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  questionId: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  attemptId: z.string().optional(),
  studentQuestion: z.string().optional(),
});

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
    const q = await prisma.question.findFirst({
      where: { id: parsed.data.questionId, deletedAt: null, reviewStatus: "PUBLISHED" },
      include: {
        hints: { where: { level: parsed.data.level }, take: 1 },
        knowledgeLinks: { include: { node: true }, take: 1 },
      },
    });
    if (!q) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "题目不存在" } }, { status: 404 });
    }
    const link = q.knowledgeLinks[0];
    const result = await explain({
      request: {
        question: q.stem,
        standardAnswer: q.standardAnswer,
        standardSolution: q.solution,
        knowledgeNode: link?.node.name ?? "",
        microSkill: "",
        hintLevel: parsed.data.level,
        studentQuestion: parsed.data.studentQuestion,
      },
      fixedHint: q.hints[0]?.content,
      studentId: user.id,
      attemptId: parsed.data.attemptId,
    });
    return NextResponse.json({ data: result });
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
  console.error("[student/explain]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
