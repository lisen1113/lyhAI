import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { startSession } from "@/lib/services/training";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ planId: z.string().optional() });

export async function POST(request: Request) {
  try {
    const user = await requireRole("STUDENT");
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "输入无效" } }, { status: 400 });
    }
    const session = await startSession(user.id, parsed.data.planId);
    return NextResponse.json({ data: session }, { status: 201 });
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
  console.error("[student/session]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
