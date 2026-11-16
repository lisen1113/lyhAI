import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { submitAttempt, TrainingError } from "@/lib/services/training";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.unknown(),
  timeSpentSec: z.number().int().min(0).optional(),
  maxHintLevel: z.number().int().min(0).max(3).default(0),
  sawSolution: z.boolean().default(false),
  skipped: z.boolean().default(false),
  planItemId: z.string().optional(),
  errorTagIds: z.array(z.string()).optional(),
  steps: z.array(z.object({
    stepIndex: z.number().int(),
    answer: z.string(),
    correct: z.boolean(),
  })).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireRole("STUDENT");
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "输入无效", details: parsed.error.issues } },
        { status: 400 }
      );
    }
    // 幂等键：优先请求头，否则用 body 生成（客户端应提供）
    const idempotencyKey = request.headers.get("idempotency-key") ??
      (body.idempotencyKey ? String(body.idempotencyKey) : `${user.id}:${body.sessionId}:${body.questionId}:${Date.now()}`);

    const result = await submitAttempt({
      studentId: user.id,
      sessionId: parsed.data.sessionId,
      questionId: parsed.data.questionId,
      answer: parsed.data.answer,
      timeSpentSec: parsed.data.timeSpentSec,
      maxHintLevel: parsed.data.maxHintLevel,
      sawSolution: parsed.data.sawSolution,
      skipped: parsed.data.skipped,
      idempotencyKey,
      errorTagIds: parsed.data.errorTagIds,
      steps: parsed.data.steps,
      planItemId: parsed.data.planItemId,
    });

    // 学生端反馈中性，不直接强调对错标签过重
    return NextResponse.json({
      data: {
        attemptId: result.attempt.id,
        correct: result.correct,
        outcome: result.outcome,
        alreadySubmitted: result.alreadySubmitted,
        standardAnswer: result.standardAnswer,
        solution: result.solution,
        errorOptions: result.errorOptions,
        knowledgeNode: result.knowledgeNode,
      },
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
  if (e instanceof TrainingError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message } },
      { status: e.code === "NOT_FOUND" ? 404 : 400 }
    );
  }
  console.error("[student/attempt]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
