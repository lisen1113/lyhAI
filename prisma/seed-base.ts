/**
 * 基础参考数据初始化（幂等）
 *
 * 生产环境的初始化顺序必须是：
 *   1) seed-base.ts        ← 本文件：学科 PH / CH
 *   2) seed-knowledge.ts   ← 完整知识树 + 微技能（依赖学科，否则报 Subject PH not found）
 *   3) seed-error-tags.ts  ← 错因标签
 *   4) 题库若干             ← 依赖知识点
 *   5) seed-production.ts  ← 正式账号
 *
 * 为什么不直接用 prisma/seed.ts：它会额外写入演示知识点、演示题目、
 * student1-3 测试账号，并把密码设为旧值，生产环境必须跳过。
 */
import { PrismaClient, SubjectCode } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed-base] 初始化学科…");

  for (const [code, name] of [
    [SubjectCode.PH, "物理"],
    [SubjectCode.CH, "化学"],
  ] as const) {
    const s = await prisma.subject.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    console.log(`  ${code} → ${s.name} (${s.id})`);
  }

  const total = await prisma.subject.count();
  console.log(`[seed-base] 完成，学科数 ${total}（期望 2）`);
}

main()
  .catch((e) => {
    console.error("[seed-base] 失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
