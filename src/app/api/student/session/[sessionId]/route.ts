import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { getSession, endSession, TrainingError } from "@/lib/services/training";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireRole("STUDENT");
    const { sessionId } = await params;
    const session = await getSession(sessionId, user.id);
    return NextResponse.json({ data: session });
  } catch (e) {
    return handleError(e);
  }
}

const endSchema = z.object({ feedback: z.enum(["EASY", "JUST_RIGHT", "HARD"]).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireRole("STUDENT");
    const { sessionId } = await params;
    const parsed = endSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "输入无效" } }, { status: 400 });
    }
    const session = await endSession(sessionId, user.id, parsed.data.feedback);
    // 会话结束时检查并授予正向成就
    const { grantAchievements } = await import("@/lib/services/achievement");
    const newAchievements = await grantAchievements(user.id);
    return NextResponse.json({ data: { ...session, newAchievements } });
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
  console.error("[student/session/:id]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
