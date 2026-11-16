// 重置学生练习数据：把指定（或全部真实）学生恢复为「刚注册、未开始学习」的干净状态。
// 用途：验收脚本跑完后清理、演示前复位、学生想重开诊断。
// 只删学习过程数据，不动账号、不动题库、不动知识点。
// 用法（注意用 ./node_modules/.bin/tsx，npx tsx 会吞掉脚本参数）：
//   ./node_modules/.bin/tsx scripts/reset-student-data.ts --all --dry   预览将要清理的量
//   ./node_modules/.bin/tsx scripts/reset-student-data.ts --all         清理全部真实学生
//   ./node_modules/.bin/tsx scripts/reset-student-data.ts liyuhan xule  只清理指定账号
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const ALL = argv.includes("--all");
const names = argv.filter((a) => !a.startsWith("--"));

/** 验收脚本专用账号名，重置真实学生时要排除 */
const VERIFY_USERNAME = "__verify";

async function main() {
  // 注意：不能用 username startsWith "__" 过滤 —— SQL LIKE 里 "_" 是通配符
  const verifyUser = await p.user.findUnique({ where: { username: VERIFY_USERNAME }, select: { id: true } });
  const excludeIds = verifyUser ? [verifyUser.id] : [];

  const students = ALL
    ? await p.user.findMany({
        where: { role: "STUDENT", id: { notIn: excludeIds } },
        select: { id: true, username: true, displayName: true },
        orderBy: { username: "asc" },
      })
    : await p.user.findMany({
        where: { role: "STUDENT", username: { in: names } },
        select: { id: true, username: true, displayName: true },
        orderBy: { username: "asc" },
      });

  if (students.length === 0) {
    console.log("没有匹配到学生。用 --all 或直接给出用户名。");
    return;
  }

  console.log("========== 学生练习数据重置 ==========");
  console.log(`目标学生 ${students.length} 名：${students.map((s) => s.username).join("、")}${DRY ? "（预览模式）" : ""}\n`);

  for (const s of students) {
    const sid = s.id;
    const sessions = await p.practiceSession.findMany({ where: { studentId: sid }, select: { id: true } });
    const sids = sessions.map((x) => x.id);

    const counts = {
      作答记录: await p.questionAttempt.count({ where: { studentId: sid } }),
      练习会话: sessions.length,
      掌握度: await p.studentMastery.count({ where: { studentId: sid } }),
      错题本: await p.studentError.count({ where: { studentId: sid } }),
      复测计划: await p.reviewSchedule.count({ where: { studentId: sid } }),
      今日计划: await p.dailyPlan.count({ where: { studentId: sid } }),
      测验记录: await p.assessmentAttempt.count({ where: { studentId: sid } }),
      成就: await p.studentAchievement.count({ where: { studentId: sid } }),
      周报: await p.weeklyReport.count({ where: { studentId: sid } }),
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`${s.username}（${s.displayName}）共 ${total} 条`);
    console.log("  " + Object.entries(counts).map(([k, v]) => `${k}:${v}`).join("  "));

    if (DRY || total === 0) continue;

    // 按外键依赖顺序清理：先子后父
    await p.attemptHint.deleteMany({ where: { attempt: { sessionId: { in: sids } } } });
    await p.attemptStep.deleteMany({ where: { attempt: { sessionId: { in: sids } } } });
    await p.studentError.deleteMany({ where: { studentId: sid } });
    await p.questionAttempt.deleteMany({ where: { studentId: sid } });
    await p.practiceSession.deleteMany({ where: { studentId: sid } });
    await p.masteryChangeLog.deleteMany({ where: { mastery: { studentId: sid } } });
    await p.studentMastery.deleteMany({ where: { studentId: sid } });
    await p.reviewSchedule.deleteMany({ where: { studentId: sid } });
    await p.weeklyReport.deleteMany({ where: { studentId: sid } });
    await p.studentAchievement.deleteMany({ where: { studentId: sid } });
    await p.assessmentAttempt.deleteMany({ where: { studentId: sid } });
    await p.dailyPlan.deleteMany({ where: { studentId: sid } });
  }

  console.log(DRY ? "\n[--dry] 未写入任何删除" : "\n清理完成，学生已回到未开始的干净状态");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
