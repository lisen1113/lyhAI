// 第2轮校验：完整学习闭环（诊断→微知识→分步训练→Hint→掌握度→错因→复测→变式）
import { PrismaClient, AttemptOutcome } from "@prisma/client";
import { ensureDailyPlan } from "../src/lib/services/scheduler";
import { startSession, submitAttempt, endSession } from "../src/lib/services/training";
import { updateReviewSchedule, getDueReviews } from "../src/lib/services/review";
import { updateMastery } from "../src/lib/services/mastery";
import { ensureVerifyStudent } from "./lib-verify-student";
const p = new PrismaClient();

let pass = 0, fail = 0;
const check = (c: boolean, m: string, d = "") => { console.log(`  ${c ? "[OK]" : "[FAIL]"} ${m}${d ? " — " + d : ""}`); c ? pass++ : fail++; };

async function main() {
  const student = await ensureVerifyStudent(p);
  const sid = student.id;
  console.log(`学生: ${student.displayName} (${sid.slice(0, 8)})\n`);

  // ===== 1. 诊断基线：清空该学生测试数据，从零开始 =====
  console.log("=== 1. 诊断基线 ===");
  const sessions = await p.practiceSession.findMany({ where: { studentId: sid }, select: { id: true } });
  const sids = sessions.map((s) => s.id);
  await p.attemptHint.deleteMany({ where: { attempt: { sessionId: { in: sids } } } });
  await p.attemptStep.deleteMany({ where: { attempt: { sessionId: { in: sids } } } });
  await p.studentError.deleteMany({ where: { studentId: sid } });
  await p.questionAttempt.deleteMany({ where: { studentId: sid } });
  await p.practiceSession.deleteMany({ where: { studentId: sid } });
  await p.studentMastery.deleteMany({ where: { studentId: sid } });
  await p.reviewSchedule.deleteMany({ where: { studentId: sid } });
  await p.dailyPlan.deleteMany({ where: { studentId: sid } });
  check(true, "清空历史测试数据（模拟新学生诊断前）");

  // ===== 2. 今日计划：六段结构 + 30分钟约束 =====
  console.log("\n=== 2. DailyPlan 六段结构 ===");
  const plan = await ensureDailyPlan(sid, new Date());
  const segs = [...new Set(plan.items.map((i) => i.segment))];
  check(segs.length === 6, "六段齐全", segs.join("/"));
  check(plan.totalMinutes >= 25 && plan.totalMinutes <= 35, "总时长25-35分钟", `${plan.totalMinutes}min`);

  // ===== 3. 热身题：非重复、来自题库 =====
  console.log("\n=== 3. 成功热身 ===");
  const warm = plan.items.filter((i) => i.segment === "WARMUP" && i.questionId);
  check(warm.length >= 2, "热身题≥2道", `${warm.length}道`);
  check(new Set(warm.map((i) => i.questionId)).size === warm.length, "计划内热身题不重复");

  // ===== 3.5 「学」的环节：微知识卡 + 学练一致 + 变式阶梯 =====
  console.log("\n=== 3.5 微知识学习环节（文档五要素）===");
  const learnItems = plan.items.filter((i) => i.segment === "MICRO_LEARN");
  check(learnItems.length >= 1, "今日含微知识学习段", `${learnItems.length}个`);

  // 每天最多 1 个新微技能（文档 5、每日训练结构）
  const newSkills = learnItems.filter((i) => i.microSkillId);
  check(newSkills.length <= 1, "每天最多学习 1 个新微技能", `${newSkills.length}个`);

  const focusSkillId = newSkills[0]?.microSkillId ?? null;
  if (focusSkillId) {
    const ms = await p.microSkill.findUnique({ where: { id: focusSkillId } });
    const pitfalls = Array.isArray(ms?.commonPitfalls) ? (ms!.commonPitfalls as unknown[]) : [];
    check(!!ms, "微知识关联到具体微技能", ms?.code ?? "无");
    check((ms?.context ?? "").trim().length >= 10, "① 情境 context 非空");
    check((ms?.coreConcept ?? "").trim().length >= 15, "② 核心概念 coreConcept 非空");
    check((ms?.formula ?? "").trim().length >= 2, "③ 公式/规则 formula 非空");
    check(pitfalls.length >= 2, "④ 常见坑 ≥2 条", `${pitfalls.length}条`);
    check((ms?.basicExample ?? "").trim().length >= 20, "⑤ 基础例题 basicExample 非空");

    // 学练一致性：专项训练首题必须落在今日所学技能上（允许同单元内展开）
    const practiceItems = plan.items
      .filter((i) => i.segment === "PRACTICE" && i.questionId)
      .sort((a, b) => a.order - b.order);
    check(practiceItems.length >= 3, "专项训练题量≥3道", `${practiceItems.length}道`);

    if (practiceItems.length) {
      const pq0 = await p.question.findUnique({ where: { id: practiceItems[0].questionId! } });
      const sameSkill = pq0?.microSkillId === focusSkillId;
      let sameScope = sameSkill;
      if (!sameScope) {
        // 允许：同单元（题量不足时按文档在同单元内展开变式）
        const [a, b] = await Promise.all([
          p.microSkill.findUnique({ where: { id: focusSkillId }, select: { node: { select: { parentId: true } } } }),
          p.microSkill.findUnique({ where: { id: pq0?.microSkillId ?? "" }, select: { node: { select: { parentId: true } } } }),
        ]);
        sameScope = !!a?.node.parentId && a.node.parentId === b?.node.parentId;
      }
      check(sameScope, "学什么练什么：专项首题与微知识同技能或同单元",
        sameSkill ? "同技能" : "同单元");

      // 变式阶梯：专项训练按 原型→轻变式→情境变式 推进（variantLevel 不下降）
      const levels: number[] = [];
      for (const it of practiceItems) {
        const qq = await p.question.findUnique({ where: { id: it.questionId! }, select: { variantLevel: true } });
        if (qq) levels.push(qq.variantLevel);
      }
      const nonDecreasing = levels.every((v, i) => i === 0 || v >= levels[i - 1]);
      check(nonDecreasing, "专项训练按变式阶梯推进（层级不回落）", `L:${levels.join("→")}`);
      check(levels.length === 0 || levels[0] === 1, "专项从原型题开始（建立模型）", `首题 L${levels[0]}`);
      check(levels.length === 0 || Math.max(...levels) >= 3, "专项包含情境变式(≥L3)", `最高 L${Math.max(...levels)}`);
    }

    // 独立通关：不得出现提示、不得重做原题、必须为变式
    const indepItems = plan.items.filter((i) => i.segment === "INDEPENDENT" && i.questionId);
    check(indepItems.length >= 1, "含独立通关题", `${indepItems.length}道`);
    check(new Set(indepItems.map((i) => i.questionId)).size === indepItems.length, "独立通关题不重复");
    const indepLevels: number[] = [];
    for (const it of indepItems) {
      const qq = await p.question.findUnique({ where: { id: it.questionId! }, select: { variantLevel: true } });
      if (qq) indepLevels.push(qq.variantLevel);
    }
    check(indepLevels.every((v) => v >= 2), "独立通关全部为变式题(≥L2)",
      `L:${indepLevels.join(",")}`);
    // 独立段不得与专项段重复
    const practiceIds = new Set(practiceItems.map((i) => i.questionId));
    const overlap = indepItems.filter((i) => practiceIds.has(i.questionId));
    check(overlap.length === 0, "独立通关不与专项训练重题", `重合 ${overlap.length} 道`);
  }

  // ===== 4. 跨天不重复：生成连续3天计划，检查热身题不重复 =====
  console.log("\n=== 4. 跨天热身轮换 ===");
  const warmIdsPerDay: string[][] = [warm.map((i) => i.questionId!)];
  for (let d = 1; d <= 3; d++) {
    const date = new Date(); date.setDate(date.getDate() + d);
    const pl = await ensureDailyPlan(sid, date);
    warmIdsPerDay.push(pl.items.filter((i) => i.segment === "WARMUP" && i.questionId).map((i) => i.questionId!));
  }
  // 未作答时，题库充足应轮换出不同题（至少第1天与后续某天不同）
  const allWarm = warmIdsPerDay.flat();
  const distinctWarm = new Set(allWarm).size;
  check(distinctWarm >= 2, "跨天热身题发生轮换（不固定同一批）", `${distinctWarm}/${allWarm.length} 不同`);

  // 清理未来3天的测试计划，避免污染
  for (let d = 1; d <= 3; d++) {
    const date = new Date(); date.setDate(date.getDate() + d); date.setUTCHours(0, 0, 0, 0);
    await p.dailyPlan.deleteMany({ where: { studentId: sid, date } });
  }

  // ===== 5. 分步训练 + Hint + 掌握度 + 错因 =====
  console.log("\n=== 5. 训练闭环 ===");
  const session = await startSession(sid, plan.id);
  // 找一道有错因标签的题，故意答错 + 用 Hint2
  const practiceItem = plan.items.find((i) => i.questionId && i.segment === "PRACTICE");
  if (!practiceItem?.questionId) throw new Error("计划中无练习题");
  const q = await p.question.findUnique({
    where: { id: practiceItem.questionId },
    include: { errorTags: true, hints: true },
  });
  check(!!q && q.hints.length >= 3, "题目有≥3级Hint", `${q?.hints.length}级`);
  check((q?.errorTags.length ?? 0) > 0, "题目有错因标签", `${q?.errorTags.length}个`);

  const res = await submitAttempt({
    studentId: sid, sessionId: session.id, questionId: practiceItem.questionId,
    answer: "__故意错误答案__", maxHintLevel: 2, sawSolution: false,
    idempotencyKey: `loop-test-${sid}-${Date.now()}`,
    errorTagIds: q?.errorTags.slice(0, 1).map((t) => t.errorTagId),
  });
  check(res.outcome === AttemptOutcome.CORRECT_AFTER_HINT_2 || res.outcome === AttemptOutcome.WRONG,
    "Hint2后错误 outcome 正确", res.outcome);
  const masteries = await p.studentMastery.count({ where: { studentId: sid } });
  check(masteries > 0, "错误后创建/更新掌握度记录", `${masteries}条`);
  const errors = await p.studentError.count({ where: { studentId: sid } });
  check(errors > 0, "错误记录错因", `${errors}条`);

  // ===== 6. 幂等：同键重复提交只记一次 =====
  console.log("\n=== 6. 防重复提交 ===");
  const key = `idem-loop-${Date.now()}`;
  const item2 = plan.items.filter((i) => i.questionId).find((i) => i.questionId !== practiceItem.questionId);
  if (item2?.questionId) {
    await submitAttempt({ studentId: sid, sessionId: session.id, questionId: item2.questionId,
      answer: "x", maxHintLevel: 0, sawSolution: false, idempotencyKey: key });
    const r2 = await submitAttempt({ studentId: sid, sessionId: session.id, questionId: item2.questionId,
      answer: "x", maxHintLevel: 0, sawSolution: false, idempotencyKey: key });
    check(r2.alreadySubmitted === true, "重复提交命中幂等");
    const cnt = await p.questionAttempt.count({ where: { idempotencyKey: key } });
    check(cnt === 1, "幂等键只产生1条记录", `${cnt}条`);
  }

  // ===== 7. 复测调度：错误后生成次日复测 =====
  console.log("\n=== 7. 间隔复测 ===");
  const rvCount = await p.reviewSchedule.count({ where: { studentId: sid } });
  check(rvCount > 0, "错误后生成复测计划", `${rvCount}条`);

  // ===== 8. 独立正确升级复测周期 =====
  console.log("\n=== 8. 独立正确→复测升级 ===");
  const m0 = await p.studentMastery.findFirst({ where: { studentId: sid }, include: { microSkill: true } });
  if (m0) {
    const before = m0.masteryScore;
    const attempt = await p.questionAttempt.findFirst({ where: { studentId: sid }, orderBy: { submittedAt: "desc" } });
    await updateMastery({ studentId: sid, microSkillId: m0.microSkillId, nodeId: m0.nodeId,
      outcome: AttemptOutcome.FIRST_TRY_CORRECT, attemptId: attempt!.id });
    const after = await p.studentMastery.findUnique({ where: { id: m0.id } });
    check((after?.masteryScore ?? 0) > before, "独立正确提升掌握度", `${before}→${after?.masteryScore}`);
  }

  // ===== 9. 结束会话 =====
  await endSession(session.id, sid, "JUST_RIGHT");
  const ended = await p.practiceSession.findUnique({ where: { id: session.id } });
  check(ended?.status === "COMPLETED", "会话正常结束", ended?.status);

  console.log(`\n========== 第2轮闭环校验: ${fail === 0 ? "全部通过 ✓" : fail + " 项未通过 ✗"} (${pass} passed) ==========`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
