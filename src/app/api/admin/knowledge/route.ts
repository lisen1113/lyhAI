import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/guards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  level: z.enum(["SUBJECT", "MODULE", "UNIT", "KNOWLEDGE_NODE"]),
  subjectId: z.string().min(1),
  parentId: z.string().optional().nullable(),
  examWeight: z.number().min(0).max(1).optional(),
  repairability: z.number().min(0).max(1).optional(),
  order: z.number().int().optional(),
});

export async function GET() {
  try {
    await requireRole("ADMIN");
    const [nodes, subjects, skills] = await Promise.all([
      prisma.knowledgeNode.findMany({ orderBy: [{ subjectId: "asc" }, { order: "asc" }] }),
      prisma.subject.findMany({ orderBy: { code: "asc" } }),
      prisma.microSkill.findMany({ orderBy: { code: "asc" } }),
    ]);
    return NextResponse.json({ data: { nodes, subjects, skills } });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "输入无效", details: parsed.error.issues } },
        { status: 400 }
      );
    }
    const node = await prisma.knowledgeNode.create({ data: parsed.data });
    return NextResponse.json({ data: node }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

const updateSchema = createSchema.partial().omit({ code: true });

export async function PATCH(request: Request) {
  try {
    await requireRole("ADMIN");
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "缺少 id" } }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "输入无效", details: parsed.error.issues } },
        { status: 400 }
      );
    }
    const node = await prisma.knowledgeNode.update({ where: { id: body.id }, data: parsed.data });
    return NextResponse.json({ data: node });
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
    // 有子节点或技能时不允许删除
    const [children, skills] = await Promise.all([
      prisma.knowledgeNode.count({ where: { parentId: id } }),
      prisma.microSkill.count({ where: { nodeId: id } }),
    ]);
    if (children > 0 || skills > 0) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "该节点含子节点或技能，无法删除" } },
        { status: 409 }
      );
    }
    await prisma.knowledgeNode.delete({ where: { id } });
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
  console.error("[admin/knowledge]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
