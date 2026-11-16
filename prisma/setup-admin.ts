// 创建/重置管理员账号（不参与学生学习数据）
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();

const ADMINS = [{ username: "lisen", displayName: "李森", password: "123456" }];

async function main() {
  for (const a of ADMINS) {
    const passwordHash = await bcrypt.hash(a.password, 10);
    const user = await p.user.upsert({
      where: { username: a.username },
      update: { passwordHash, displayName: a.displayName, role: Role.ADMIN, status: UserStatus.ACTIVE },
      create: {
        username: a.username,
        passwordHash,
        displayName: a.displayName,
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    console.log(`[ADMIN] ${user.username} / ${user.displayName} 已就绪`);
  }

  const admins = await p.user.findMany({
    where: { role: Role.ADMIN },
    select: { username: true, displayName: true, status: true },
  });
  console.log("\n当前管理员：");
  for (const u of admins) console.log(`  ${u.username}  ${u.displayName}  ${u.status}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
