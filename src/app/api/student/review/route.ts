import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { getDueReviews } from "@/lib/services/review";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireRole("STUDENT");
    const reviews = await getDueReviews(user.id);
    const data = reviews.map((r) => ({
      id: r.id, skillName: r.microSkill.name, nodeName: r.node.name,
      stage: r.stage, nextReviewAt: r.nextReviewAt, remedial: r.remedial, boost: r.boost,
    }));
    return NextResponse.json({ data });
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
  console.error("[student/review]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
