import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { getQuestionById } from "@/lib/services/question";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireRole("STUDENT");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "缺少 id" } }, { status: 400 });
    }
    const q = await getQuestionById(id);
    if (!q || q.reviewStatus !== "PUBLISHED") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "题目不存在" } }, { status: 404 });
    }
    // 学生端不返回标准答案与完整解析；Hint 仅返回 1-3 级
    return NextResponse.json({
      data: {
        id: q.id,
        type: q.type,
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options,
        estimatedTime: q.estimatedTime,
        knowledge: q.knowledgeLinks.map((l) => ({ name: l.node.name, code: l.node.code })),
        hints: q.hints.filter((h) => h.level <= 3).map((h) => ({ level: h.level, content: h.content })),
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
  console.error("[student/question]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
