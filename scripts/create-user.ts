// 创建账号（幂等：已存在则重置密码）。
// 口令通过环境变量 NEW_USER_PW 传入，避免出现在命令行历史里。
// 用法：
//   NEW_USER_PW=xxx ./node_modules/.bin/tsx scripts/create-user.ts test "测试账号" [STUDENT|ADMIN] [年级]
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();

async function main() {
  const [username, displayName, roleArg, gradeArg] = process.argv.slice(2);
  const pw = process.env.NEW_USER_PW;

  if (!username || !displayName) {
    console.log('用法: NEW_USER_PW=口令 ./node_modules/.bin/tsx scripts/create-user.ts <用户名> <显示名> [STUDENT|ADMIN] [年级]');
    process.exitCode = 1;
    return;
  }
  if (!pw || pw.length < 6) {
    console.log("请通过环境变量 NEW_USER_PW 提供至少 6 位口令");
    process.exitCode = 1;
    return;
  }

  const role = roleArg === "ADMIN" ? "ADMIN" : "STUDENT";
  const grade = gradeArg ? Number(gradeArg) : 8;
  const passwordHash = await bcrypt.hash(pw, 10);

  const existed = await p.user.findUnique({ where: { username } });
  if (existed) {
    await p.user.update({
      where: { username },
      data: { passwordHash, displayName, role, status: "ACTIVE" },
    });
    console.log(`已存在，已重置：${username}（${displayName}，${role}）`);
    return;
  }

  await p.user.create({
    data: {
      username,
      passwordHash,
      displayName,
      role,
      status: "ACTIVE",
      ...(role === "STUDENT" ? { studentProfile: { create: { grade } } } : {}),
    },
  });
  console.log(`已创建：${username}（${displayName}，${role}${role === "STUDENT" ? `，${grade} 年级` : ""}）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
