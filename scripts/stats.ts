import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  console.log("用户:", await p.user.count());
  console.log("知识节点:", await p.knowledgeNode.count());
  console.log("微技能:", await p.microSkill.count());
  console.log("题目:", await p.question.count());
  console.log("作答记录:", await p.questionAttempt.count());
  console.log("掌握度记录:", await p.studentMastery.count());
  console.log("复测计划:", await p.reviewSchedule.count());
  console.log("DailyPlan:", await p.dailyPlan.count());
  console.log("测验:", await p.assessment.count());
  console.log("成就定义:", await p.achievement.count());
  await p.$disconnect();
}
main();
