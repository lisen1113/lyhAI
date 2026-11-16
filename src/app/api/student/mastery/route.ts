import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "未开始", INTRO: "初次接触", LEARNING: "正在学习",
  BASIC: "基础掌握", PROFICIENT: "熟练掌握", STABLE: "稳定掌握",
};

export async function GET() {
  try {
    const user = await requireRole("STUDENT");
    const masteries = await prisma.studentMastery.findMany({
      where: { studentId: user.id },
      include: { microSkill: true, node: true },
      orderBy: { masteryScore: "desc" },
    });
    // 学生端只返回中性表达，不暴露数值分数/排名
    const data = masteries.map((m) => ({
      id: m.id,
      skillName: m.microSkill.name,
      nodeName: m.node.name,
      status: STATUS_LABEL[m.status] ?? m.status,
      // 星级：按状态映射 1-5 星
      stars: m.status === "STABLE" ? 5 : m.status === "PROFICIENT" ? 4 : m.status === "BASIC" ? 3 : m.status === "LEARNING" ? 2 : 1,
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
  console.error("[student/mastery]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
