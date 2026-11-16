import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { createAssessment, listAssessments } from "@/lib/services/assessment";
import { z } from "zod";
import { AssessmentType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const list = await listAssessments();
    return NextResponse.json({ data: list });
  } catch (e) { return handleError(e); }
}

const schema = z.object({
  type: z.nativeEnum(AssessmentType),
  title: z.string().min(1),
  subjectCode: z.enum(["PH", "CH"]).optional(),
  questionCount: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "输入无效", details: parsed.error.issues } }, { status: 400 });
    }
    const assessment = await createAssessment(parsed.data);
    return NextResponse.json({ data: assessment }, { status: 201 });
  } catch (e) { return handleError(e); }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "UNAUTHORIZED" ? 401 : 403 });
  }
  console.error("[admin/assessments]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
