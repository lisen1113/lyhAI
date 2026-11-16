import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, AuthError } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") ?? "20"));

    const where: Record<string, unknown> = { deletedAt: null };
    if (subject) where.subject = { code: subject };
    if (status) where.reviewStatus = status;
    if (search) where.stem = { contains: search, mode: "insensitive" };

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where: where as never,
        include: {
          subject: true,
          knowledgeLinks: { include: { node: true } },
          hints: { orderBy: { level: "asc" } },
          _count: { select: { attempts: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.question.count({ where: where as never }),
    ]);
    return NextResponse.json({ data: { questions, total, page, pageSize } });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole("ADMIN");
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "缺少 id" } }, { status: 400 });
    }
    const allowed: Record<string, unknown> = {};
    for (const key of ["stem", "standardAnswer", "solution", "difficulty", "reviewStatus", "estimatedTime", "source"]) {
      if (body[key] !== undefined) allowed[key] = body[key];
    }
    if (body.options !== undefined) allowed.options = body.options;
    const q = await prisma.question.update({ where: { id: body.id }, data: allowed as never });
    return NextResponse.json({ data: q });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "缺少 id" } }, { status: 400 });
    }
    // 软删除
    await prisma.question.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ data: { ok: true } });
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
  console.error("[admin/questions]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
