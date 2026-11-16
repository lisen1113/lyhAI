// AI fallback + 诊断/周测验收
import { PrismaClient, AssessmentType } from "@prisma/client";
import { explain } from "../src/lib/ai/tutor";
import { createAssessment, submitAssessment } from "../src/lib/services/assessment";
import { ensureVerifyStudent } from "./lib-verify-student";

const prisma = new PrismaClient();

async function main() {
  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) { console.log(`  ✓ ${name}`); pass++; }
    else { console.log(`  ✗ ${name} ${detail}`); fail++; }
  };

  console.log("AI + 测验验收:");
  const student = await ensureVerifyStudent(prisma);
  const q = await prisma.question.findFirst({ where: { reviewStatus: "PUBLISHED", deletedAt: null } });
  if (!q) throw new Error("no question");

  // ---------- AI fallback（默认 AI_PROVIDER=none，必然降级）----------
  const before = await prisma.aIInteractionLog.count();
  const r = await explain({
    request: {
      question: q.stem, standardAnswer: q.standardAnswer, standardSolution: q.solution,
      knowledgeNode: "测试", microSkill: "测试", hintLevel: 1,
    },
    fixedHint: "这是固定提示",
    studentId: student.id,
  });
  check("AI 降级返回内容", r.content.length > 0, `content=${r.content}`);
  check("降级来源=FIXED", r.source === "FIXED", `source=${r.source}`);
  check("降级使用固定 Hint", r.content === "这是固定提示", `content=${r.content}`);
  const after = await prisma.aIInteractionLog.count();
  check("AI 调用有日志记录", after === before + 1, `before=${before} after=${after}`);
  const log = await prisma.aIInteractionLog.findFirst({ orderBy: { createdAt: "desc" } });
  check("日志记录 FAILURE 状态", log?.status === "FAILURE", `status=${log?.status}`);

  // ---------- 诊断测验 ----------
  const assessment = await createAssessment({
    type: AssessmentType.DIAGNOSTIC, title: "物理入学诊断", subjectCode: "PH", questionCount: 5,
  });
  check("测验创建含题目", assessment.questions.length === 5, `count=${assessment.questions.length}`);

  // 全部用标准答案提交
  const answers = await Promise.all(
    assessment.questions.map(async (aq) => {
      const full = await prisma.question.findUnique({ where: { id: aq.questionId } });
      const ans = full!.type === "NUMERIC" ? full!.standardAnswer.replace(/[^\d.\-]/g, "") : full!.standardAnswer;
      return { questionId: aq.questionId, answer: ans };
    })
  );
  const result = await submitAssessment({ assessmentId: assessment.id, studentId: student.id, answers });
  check("测验判分完成", result.total === 5 && result.correct >= 0, `correct=${result.correct}/${result.total}`);
  check("测验正确率合理", result.accuracy >= 0 && result.accuracy <= 100, `accuracy=${result.accuracy}`);

  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.id } },
  });
  check("测验作答记录已保存", !!attempt && attempt.analysis != null);

  const masteryCount = await prisma.studentMastery.count({ where: { studentId: student.id } });
  check("测验后掌握度已初始化", masteryCount > 0, `count=${masteryCount}`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
