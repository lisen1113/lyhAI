import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { submitAssessment } from "@/lib/services/assessment";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("STUDENT");
    const assessments = await prisma.assessment.findMany({
      where: { status: { not: "SCHEDULED" } },
      include: {
        questions: { include: { question: { select: { id: true, stem: true, type: true } } } },
        attempts: { where: {}, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ data: assessments });
  } catch (e) { return handleError(e); }
}

const submitSchema = z.object({
  assessmentId: z.string().min(1),
  answers: z.array(z.object({ questionId: z.string(), answer: z.unknown() })),
});

export async function POST(request: Request) {
  try {
    const user = await requireRole("STUDENT");
    const parsed = submitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "输入无效" } }, { status: 400 });
    }
    const result = await submitAssessment({
      assessmentId: parsed.data.assessmentId,
      studentId: user.id,
      answers: parsed.data.answers.map((a) => ({ questionId: a.questionId, answer: a.answer })),
    });
    return NextResponse.json({ data: result });
  } catch (e) { return handleError(e); }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "UNAUTHORIZED" ? 401 : 403 });
  }
  console.error("[student/assessment]", e);
  const msg = e instanceof Error ? e.message : "服务器错误";
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: msg } }, { status: 500 });
}
