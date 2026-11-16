// 训练引擎验收：会话→提交→判分→掌握度→幂等→Hint→错因
import { PrismaClient, AttemptOutcome } from "@prisma/client";
import { startSession, submitAttempt, getSession, endSession } from "../src/lib/services/training";
import { countRecentErrors } from "../src/lib/services/mastery";
import { ensureVerifyStudent } from "./lib-verify-student";

const prisma = new PrismaClient();

async function main() {
  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) { console.log(`  ✓ ${name}`); pass++; }
    else { console.log(`  ✗ ${name} ${detail}`); fail++; }
  };

  console.log("训练引擎验收:");

  const student = await ensureVerifyStudent(prisma);

  // 找 3 道不同的已发布数值题（每场景独立题目，避免唯一约束冲突）
  const qs = await prisma.question.findMany({
    where: { reviewStatus: "PUBLISHED", type: "NUMERIC", deletedAt: null },
    take: 3, orderBy: { createdAt: "asc" },
  });
  if (qs.length < 3) throw new Error("need 3 published numeric questions");
  const [q1, q2, q3] = qs;

  // ---------- 场景1：会话 + 首次独立答对 + 幂等 ----------
  const session = await startSession(student.id);
  check("会话创建成功", !!session.id && session.status === "IN_PROGRESS");

  const stdNum1 = parseFloat(q1.standardAnswer.replace(/[^\d.\-]/g, ""));
  const key = `verify-${Date.now()}-1`;
  const r1 = await submitAttempt({
    studentId: student.id, sessionId: session.id, questionId: q1.id,
    answer: String(stdNum1), maxHintLevel: 0, sawSolution: false, idempotencyKey: key,
  });
  check("答对判定正确", r1.correct === true, `got ${r1.correct}`);
  check("outcome=FIRST_TRY_CORRECT", r1.outcome === AttemptOutcome.FIRST_TRY_CORRECT, `got ${r1.outcome}`);

  const r1b = await submitAttempt({
    studentId: student.id, sessionId: session.id, questionId: q1.id,
    answer: String(stdNum1), maxHintLevel: 0, sawSolution: false, idempotencyKey: key,
  });
  check("幂等：重复提交被识别", r1b.alreadySubmitted === true);
  check("幂等：attemptId 一致", r1b.attempt.id === r1.attempt.id);

  // ---------- 场景2：掌握度更新与审计 ----------
  const link = await prisma.questionKnowledge.findFirst({ where: { questionId: q1.id } });
  if (link) {
    const skill = await prisma.microSkill.findFirst({ where: { nodeId: link.nodeId } });
    if (skill) {
      const m = await prisma.studentMastery.findUnique({
        where: { studentId_microSkillId: { studentId: student.id, microSkillId: skill.id } },
      });
      check("掌握度记录已创建", !!m && m.masteryScore > 0, `score=${m?.masteryScore}`);
      const changes = await prisma.masteryChangeLog.count({ where: { masteryId: m!.id } });
      check("掌握度变更日志已写", changes >= 1, `changes=${changes}`);
    }
  }

  // ---------- 场景3：Hint 后答对 → outcome 不同（独立会话+不同题）----------
  const session2 = await startSession(student.id);
  const stdNum2 = parseFloat(q2.standardAnswer.replace(/[^\d.\-]/g, ""));
  const r2 = await submitAttempt({
    studentId: student.id, sessionId: session2.id, questionId: q2.id,
    answer: String(stdNum2), maxHintLevel: 2, sawSolution: false, idempotencyKey: `verify-${Date.now()}-2`,
  });
  check("Hint后正确 outcome=HINT_2", r2.outcome === AttemptOutcome.CORRECT_AFTER_HINT_2, `got ${r2.outcome}`);
  const hintCount = await prisma.attemptHint.count({ where: { attemptId: r2.attempt.id } });
  check("Hint 使用被记录", hintCount === 2, `count=${hintCount}`);

  // ---------- 场景4：答错 + 错因（独立会话+不同题）----------
  const session3 = await startSession(student.id);
  const errTag = await prisma.errorTag.findFirst();
  const r3 = await submitAttempt({
    studentId: student.id, sessionId: session3.id, questionId: q3.id,
    answer: "999999", maxHintLevel: 0, sawSolution: false,
    idempotencyKey: `verify-${Date.now()}-3`, errorTagIds: errTag ? [errTag.id] : [],
  });
  check("答错判定正确", r3.correct === false, `got ${r3.correct}`);
  check("outcome=WRONG", r3.outcome === AttemptOutcome.WRONG, `got ${r3.outcome}`);
  if (errTag) {
    const cnt = await countRecentErrors(student.id, errTag.id);
    check("错因记录可查询", cnt >= 1, `count=${cnt}`);
  }

  // ---------- 场景5：会话读取（断点恢复）----------
  const loaded = await getSession(session.id, student.id);
  check("会话读取含作答记录", loaded.attempts.length === 1, `attempts=${loaded.attempts.length}`);

  // ---------- 场景6：结束会话 ----------
  const ended = await endSession(session.id, student.id, "JUST_RIGHT");
  check("会话结束成功", ended.status === "COMPLETED", `status=${ended.status}`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
