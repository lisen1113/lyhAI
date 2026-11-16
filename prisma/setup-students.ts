// 学生账号标准配置（可重复执行）
// 只保留三名学生：liyuhan / xule / qinjn，密码统一 123456
// 同时清理测试账号与校验过程产生的练习记录，保证交付时是干净的初始状态。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();

const STUDENTS = [
  { username: "liyuhan", displayName: "李语涵", grade: 9 },
  { username: "xule", displayName: "徐乐", grade: 9 },
  { username: "qinjn", displayName: "秦鉴楠", grade: 9 },
] as const;

const PASSWORD = "123456";

async function clearPracticeData(studentId: string) {
  const sessions = await p.practiceSession.findMany({ where: { studentId }, select: { id: true } });
  const sids = sessions.map((s) => s.id);
  if (sids.length) {
    await p.attemptHint.deleteMany({ where: { attempt: { sessionId: { in: sids } } } });
    await p.attemptStep.deleteMany({ where: { attempt: { sessionId: { in: sids } } } });
  }
  await p.masteryChangeLog.deleteMany({ where: { mastery: { studentId } } });
  await p.studentError.deleteMany({ where: { studentId } });
  await p.questionAttempt.deleteMany({ where: { studentId } });
  await p.practiceSession.deleteMany({ where: { studentId } });
  await p.studentMastery.deleteMany({ where: { studentId } });
  await p.reviewSchedule.deleteMany({ where: { studentId } });
  await p.dailyPlan.deleteMany({ where: { studentId } });
  await p.assessmentAttempt.deleteMany({ where: { studentId } });
  await p.studentAchievement.deleteMany({ where: { studentId } });
  await p.weeklyReport.deleteMany({ where: { studentId } });
  await p.aIInteractionLog.deleteMany({ where: { studentId } });
}

async function main() {
  console.log("========== 1. 清理非标准学生账号 ==========");
  const keep = STUDENTS.map((s) => s.username);
  const extras = await p.user.findMany({
    where: { role: "STUDENT", username: { notIn: keep } },
    select: { id: true, username: true, displayName: true },
  });
  for (const u of extras) {
    await clearPracticeData(u.id);
    await p.user.delete({ where: { id: u.id } });
    console.log(`  已删除测试账号 ${u.username}（${u.displayName}）`);
  }
  if (!extras.length) console.log("  无多余学生账号");

  console.log("\n========== 2. 配置三名学生 ==========");
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const s of STUDENTS) {
    const existing = await p.user.findUnique({ where: { username: s.username } });
    if (existing) {
      await p.user.update({
        where: { id: existing.id },
        data: { displayName: s.displayName, passwordHash: hash, role: "STUDENT", status: "ACTIVE" },
      });
      // 年级信息保持
      const prof = await p.studentProfile.findUnique({ where: { userId: existing.id } });
      if (prof) {
        await p.studentProfile.update({ where: { userId: existing.id }, data: { grade: s.grade } });
      } else {
        await p.studentProfile.create({ data: { userId: existing.id, grade: s.grade } });
      }
      const oldName = existing.displayName !== s.displayName ? `（原名 ${existing.displayName}）` : "";
      console.log(`  已更新 ${s.username} → ${s.displayName}${oldName}`);
    } else {
      const u = await p.user.create({
        data: {
          username: s.username,
          displayName: s.displayName,
          passwordHash: hash,
          role: "STUDENT",
          status: "ACTIVE",
          studentProfile: { create: { grade: s.grade } },
        },
      });
      console.log(`  已创建 ${s.username} → ${s.displayName} (${u.id.slice(0, 8)})`);
    }
  }

  console.log("\n========== 3. 清空三人的历史练习记录（干净起步） ==========");
  for (const s of STUDENTS) {
    const u = await p.user.findUnique({ where: { username: s.username }, select: { id: true } });
    if (!u) continue;
    const before = await p.questionAttempt.count({ where: { studentId: u.id } });
    await clearPracticeData(u.id);
    const after = await p.questionAttempt.count({ where: { studentId: u.id } });
    console.log(`  ${s.username}: 答题记录 ${before} → ${after}`);
  }

  console.log("\n========== 4. 校验 ==========");
  const all = await p.user.findMany({
    select: { username: true, displayName: true, role: true, status: true },
    orderBy: [{ role: "asc" }, { username: "asc" }],
  });
  for (const u of all) console.log(`  ${u.role}\t${u.username}\t${u.displayName}\t${u.status}`);

  const ok = await Promise.all(STUDENTS.map(async (s) => {
    const u = await p.user.findUnique({ where: { username: s.username } });
    return u ? bcrypt.compare(PASSWORD, u.passwordHash) : false;
  }));
  console.log(`\n  密码 ${PASSWORD} 校验: ` + (ok.every(Boolean) ? "三名学生全部通过 ✓" : "存在失败 ✗"));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
