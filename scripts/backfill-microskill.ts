// 回填 question.microSkillId。
// 背景：seed-question-bank-v2.ts / seed-question-bank-v3.ts 建题时只写了 knowledgeLinks（节点关联），
// 没有写 microSkillId。首次建库后由一次性脚本补齐；只要重导其中一题就会漏绑，
// 该题随即从「变式密度」「专项训练选题池」里消失。本脚本按主知识点 code + "-S01" 幂等补齐。
// 用法：npx tsx scripts/backfill-microskill.ts [--dry]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

async function main() {
  const orphans = await prisma.question.findMany({
    where: { deletedAt: null, microSkillId: null },
    select: {
      id: true,
      source: true,
      stem: true,
      knowledgeLinks: {
        where: { isPrimary: true },
        select: { node: { select: { code: true } } },
      },
    },
  });

  console.log("========== 微技能绑定回填 ==========");
  console.log(`未绑定微技能的题目 ${orphans.length} 道`);

  const failed: string[] = [];
  const fixes: { id: string; source: string; skillId: string; skillCode: string }[] = [];

  for (const q of orphans) {
    const nodeCode = q.knowledgeLinks[0]?.node.code;
    if (!nodeCode) {
      failed.push(`${q.source ?? q.id} 缺少主知识点关联`);
      continue;
    }
    const skill = await prisma.microSkill.findFirst({
      where: { code: `${nodeCode}-S01` },
      select: { id: true, code: true },
    });
    if (!skill) {
      failed.push(`${q.source ?? q.id} 找不到微技能 ${nodeCode}-S01`);
      continue;
    }
    fixes.push({ id: q.id, source: q.source ?? q.id, skillId: skill.id, skillCode: skill.code });
  }

  for (const f of fixes) console.log(`  ${f.source} → ${f.skillCode}`);

  if (DRY) {
    console.log(`\n[--dry] 待绑定 ${fixes.length} 道，未写入`);
  } else {
    for (const f of fixes) {
      await prisma.question.update({ where: { id: f.id }, data: { microSkillId: f.skillId } });
    }
    console.log(`\n已绑定 ${fixes.length} 道`);
  }

  if (failed.length) {
    console.log(`\n无法自动处理 ${failed.length} 道，需要人工确认：`);
    for (const f of failed) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
