/**
 * 生产环境账号初始化（幂等）
 *
 * 与 prisma/seed.ts 的区别：
 * - 只创建正式在用的 4 个账号（1 管理员 + 3 学生），不建 student1/2/3 等测试号
 * - 密码来自环境变量 SEED_PASSWORD，不写死在代码里
 * - 显示名称为中文真实姓名
 * - 不创建任何演示知识点 / 演示题目
 *
 * 用法：
 *   SEED_PASSWORD=****** DATABASE_URL=... npx tsx prisma/seed-production.ts
 *
 * 可安全重复执行：已存在的账号会更新密码与显示名，不会重复创建。
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD: string = process.env.SEED_PASSWORD ?? "";
if (PASSWORD.length < 6) {
  console.error("缺少环境变量 SEED_PASSWORD（至少 6 位），已中止。");
  process.exit(1);
}

const ADMIN = { username: "lisen", displayName: "李森" };

const STUDENTS = [
  { username: "liyuhan", displayName: "李语涵" },
  { username: "xule", displayName: "徐乐" },
  { username: "qinjn", displayName: "秦鉴楠" },
];

async function main() {
  console.log("[seed-production] 开始初始化正式账号…");
  const hash = await bcrypt.hash(PASSWORD, 12);

  // ---------- 管理员 ----------
  const admin = await prisma.user.upsert({
    where: { username: ADMIN.username },
    update: { passwordHash: hash, displayName: ADMIN.displayName, role: Role.ADMIN, status: "ACTIVE" },
    create: {
      username: ADMIN.username,
      passwordHash: hash,
      displayName: ADMIN.displayName,
      role: Role.ADMIN,
    },
  });
  console.log(`  管理员 ${ADMIN.username} (${ADMIN.displayName}) 就绪`);

  // ---------- 学生 ----------
  for (const s of STUDENTS) {
    const user = await prisma.user.upsert({
      where: { username: s.username },
      update: { passwordHash: hash, displayName: s.displayName, role: Role.STUDENT, status: "ACTIVE" },
      create: {
        username: s.username,
        passwordHash: hash,
        displayName: s.displayName,
        role: Role.STUDENT,
      },
    });

    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: { nickname: s.displayName, grade: 9 },
      create: { userId: user.id, nickname: s.displayName, grade: 9 },
    });

    console.log(`  学生 ${s.username} (${s.displayName}) 就绪`);
  }

  const total = await prisma.user.count();
  console.log(`[seed-production] 完成，当前账号总数 ${total}（期望 4）`);
  if (total !== 4) {
    console.warn("[seed-production] 警告：账号数与预期不符，请检查是否残留旧数据");
  }
  console.log(`  管理员 id: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error("[seed-production] 失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
