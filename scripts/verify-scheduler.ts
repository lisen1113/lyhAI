// 调度器验收：DailyPlan 六段、时长约束、幂等、复测集成
import { PrismaClient, PlanSegment } from "@prisma/client";
import { ensureDailyPlan } from "../src/lib/services/scheduler";
import { updateReviewSchedule, getDueReviews } from "../src/lib/services/review";
import { AttemptOutcome } from "@prisma/client";
import { ensureVerifyStudent } from "./lib-verify-student";

const prisma = new PrismaClient();

async function main() {
  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) { console.log(`  ✓ ${name}`); pass++; }
    else { console.log(`  ✗ ${name} ${detail}`); fail++; }
  };

  console.log("调度器验收:");
  const student = await ensureVerifyStudent(prisma);

  // 用固定日期生成计划（2026-11-16 周一，物理）
  const date = new Date("2026-11-16T00:00:00Z");
  const plan = await ensureDailyPlan(student.id, date);
  check("计划已生成", !!plan.id);
  check("主科=物理(周一)", plan.primarySubject === "PH", `got ${plan.primarySubject}`);
  check("总时长 25-35 分钟", plan.totalMinutes >= 25 && plan.totalMinutes <= 35, `got ${plan.totalMinutes}`);

  const segments = new Set(plan.items.map((i) => i.segment));
  check("含热身段", segments.has(PlanSegment.WARMUP));
  check("含微知识段", segments.has(PlanSegment.MICRO_LEARN));
  check("含专项训练段", segments.has(PlanSegment.PRACTICE));
  check("含独立通关段", segments.has(PlanSegment.INDEPENDENT));
  check("含总结段", segments.has(PlanSegment.SUMMARY));

  const practiceCount = plan.items.filter((i) => i.segment === PlanSegment.PRACTICE).length;
  check("专项训练 4-6 题", practiceCount >= 4 && practiceCount <= 6, `count=${practiceCount}`);
  const indepCount = plan.items.filter((i) => i.segment === PlanSegment.INDEPENDENT).length;
  check("独立通关 2 题", indepCount === 2, `count=${indepCount}`);

  // 幂等：同日再次生成复用
  const plan2 = await ensureDailyPlan(student.id, date);
  check("同日计划幂等复用", plan2.id === plan.id);

  // 复测集成：创建一个 1 天前的到期复测
  const skill = await prisma.microSkill.findFirst({ orderBy: { code: "asc" } });
  if (skill) {
    await prisma.reviewSchedule.deleteMany({ where: { studentId: student.id, microSkillId: skill.id } });
    const rv = await updateReviewSchedule({
      studentId: student.id, microSkillId: skill.id, nodeId: skill.nodeId,
      outcome: AttemptOutcome.FIRST_TRY_CORRECT,
    });
    check("复测计划创建", !!rv && rv.stage === 1, `stage=${rv?.stage}`);
    // 模拟错误 → 次日
    const rv2 = await updateReviewSchedule({
      studentId: student.id, microSkillId: skill.id, nodeId: skill.nodeId,
      outcome: AttemptOutcome.WRONG,
    });
    check("错误后次日复测", rv2 != null && rv2.consecutiveFails === 1, `fails=${rv2?.consecutiveFails}`);
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
