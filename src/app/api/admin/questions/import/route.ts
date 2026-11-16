import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, AuthError } from "@/lib/auth/guards";
import { QuestionType, Difficulty, ReviewStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// 简易 CSV 解析（支持引号包裹与逗号转义）
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field.trim()); field = ""; }
      else if (c === "\n") { row.push(field.trim()); field = ""; if (row.some((x) => x)) rows.push(row); row = []; }
      else if (c !== "\r") field += c;
    }
  }
  row.push(field.trim());
  if (row.some((x) => x)) rows.push(row);
  return rows;
}

const TYPE_MAP: Record<string, QuestionType> = {
  "单选": "SINGLE_CHOICE", "SINGLE_CHOICE": "SINGLE_CHOICE",
  "判断": "TRUE_FALSE", "TRUE_FALSE": "TRUE_FALSE",
  "填空": "FILL_BLANK", "FILL_BLANK": "FILL_BLANK",
  "数值": "NUMERIC", "NUMERIC": "NUMERIC",
  "分步": "STEP_BY_STEP", "STEP_BY_STEP": "STEP_BY_STEP",
};
const DIFF_MAP: Record<string, Difficulty> = {
  "1": "L1", "2": "L2", "3": "L3", "4": "L4", "5": "L5",
  "L1": "L1", "L2": "L2", "L3": "L3", "L4": "L4", "L5": "L5",
};

// 列格式: 学科代码,题型,难度,题干,选项(JSON或空),标准答案,解析,Hint1,Hint2,Hint3,知识点code,来源
export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");
    const body = await request.json();
    const csv: string = body.csv ?? "";
    const confirm = body.confirm === true;
    const rows = parseCSV(csv);
    if (rows.length < 2) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "CSV 无有效数据行" } }, { status: 400 });
    }

    const header = rows[0];
    const parsed: Array<Record<string, unknown> & { valid: boolean; errors: string[] }> = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      const [subjectCode, typeStr, diffStr, stem, optionsStr, answer, solution, h1, h2, h3, nodeCode, source] =
        Array.from({ length: header.length }, (_, k) => cells[k] ?? "");
      const errors: string[] = [];
      const type = TYPE_MAP[typeStr];
      const difficulty = DIFF_MAP[diffStr];
      const subject = await prisma.subject.findUnique({ where: { code: subjectCode as never } });
      const node = nodeCode ? await prisma.knowledgeNode.findUnique({ where: { code: nodeCode } }) : null;
      if (!type) errors.push(`未知题型:${typeStr}`);
      if (!difficulty) errors.push(`未知难度:${diffStr}`);
      if (!subject) errors.push(`未知学科:${subjectCode}`);
      if (!stem) errors.push("题干为空");
      if (!answer) errors.push("答案为空");
      let options: unknown = null;
      if (optionsStr) {
        try { options = JSON.parse(optionsStr); } catch { errors.push("选项不是合法JSON"); }
      }
      parsed.push({
        subjectCode, type, difficulty, stem, options, answer, solution,
        hints: [h1, h2, h3].filter(Boolean), nodeId: node?.id ?? null, source: source || "import",
        valid: errors.length === 0, errors,
      });
    }

    // 预览模式：只返回校验结果
    if (!confirm) {
      const validCount = parsed.filter((p) => p.valid).length;
      return NextResponse.json({ data: { preview: parsed, total: parsed.length, validCount } });
    }

    // 确认导入：只导入 valid 行，状态为 PENDING（暂存，需审核后发布）
    let imported = 0;
    for (const p of parsed) {
      if (!p.valid) continue;
      await prisma.question.create({
        data: {
          subjectId: (await prisma.subject.findUnique({ where: { code: p.subjectCode as never } }))!.id,
          type: p.type as QuestionType,
          difficulty: p.difficulty as Difficulty,
          stem: p.stem as string,
          options: p.options ? JSON.stringify(p.options) : undefined,
          standardAnswer: p.answer as string,
          solution: (p.solution as string) || "",
          source: p.source as string,
          reviewStatus: ReviewStatus.PENDING, // 暂存，需审核
          hints: {
            create: (p.hints as string[]).map((h, idx) => ({ level: idx + 1, content: h })),
          },
          ...(p.nodeId ? { knowledgeLinks: { create: [{ nodeId: p.nodeId as string, isPrimary: true }] } } : {}),
        },
      });
      imported++;
    }
    return NextResponse.json({ data: { imported, skipped: parsed.length - imported } }, { status: 201 });
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
  console.error("[admin/questions/import]", e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
}
