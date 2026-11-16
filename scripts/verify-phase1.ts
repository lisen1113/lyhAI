// Phase 1 验收脚本：验证 seed 数据、角色、密码哈希、知识树
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  let pass = 0;
  let fail = 0;
  function check(name: string, ok: boolean, detail = "") {
    if (ok) {
      console.log(`  ✓ ${name}`);
      pass++;
    } else {
      console.log(`  ✗ ${name} ${detail}`);
      fail++;
    }
  }

  console.log("Phase 1 验收:");

  const admin = await prisma.user.findUnique({ where: { username: "lisen" } });
  // 排除验收脚本专用账号 __verify，它不属于真实学生
  const verifyUser = await prisma.user.findUnique({ where: { username: "__verify" }, select: { id: true } });
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", id: { notIn: verifyUser ? [verifyUser.id] : [] } },
    orderBy: { username: "asc" },
  });

  check("管理员账号存在", !!admin && admin.role === "ADMIN");
  check("3 名学生账号存在", students.length === 3, `实际 ${students.length}`);
  // 不在这里硬编码口令：只校验"已被 bcrypt 哈希"且"错误口令无法通过"
  const isBcrypt = (h: string) => /^\$2[aby]\$/.test(h);
  check(
    "管理员密码已哈希存储",
    !!admin && isBcrypt(admin.passwordHash) && !(await bcrypt.compare("wrong-password", admin.passwordHash))
  );
  check(
    "学生密码已哈希存储",
    students.length === 3 &&
      students.every((s) => isBcrypt(s.passwordHash)) &&
      !(await bcrypt.compare("wrong-password", students[0].passwordHash))
  );

  const treeCount = await prisma.knowledgeNode.count();
  const skillCount = await prisma.microSkill.count();
  const questionCount = await prisma.question.count();
  const group = await prisma.studyGroup.findFirst();
  check("基础知识树存在", treeCount >= 5, `节点数 ${treeCount}`);
  check("MicroSkill 存在", skillCount >= 2, `技能数 ${skillCount}`);
  check("测试题存在", questionCount >= 2, `题目数 ${questionCount}`);
  check("学习小组(合作目标)存在", !!group);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
