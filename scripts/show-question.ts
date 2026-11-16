// 题目查看工具：按微技能 code 列出该技能下所有题目（含答案/解析/选项），
// 用于补题前确认已有题干、排查缺口，避免重复出题。
// 用法：npx tsx scripts/show-question.ts PH-M09-U03-K01-S01 [更多code...]
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const codes = process.argv.slice(2);
  if (codes.length === 0) {
    console.log("用法: npx tsx scripts/show-question.ts <微技能code> [...]");
    return;
  }
  for (const code of codes) {
    const s = await p.microSkill.findFirst({ where: { code } });
    if (!s) {
      console.log(`\n[MISS] ${code}`);
      continue;
    }
    const qs = await p.question.findMany({
      where: { microSkillId: s.id, deletedAt: null },
      orderBy: [{ variantLevel: "asc" }, { source: "asc" }],
    });
    const dist = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const q of qs) dist[q.variantLevel] = (dist[q.variantLevel] ?? 0) + 1;
    console.log(`\n########## ${code} ${s.name}  共 ${qs.length} 题（L1:${dist[1]} L2:${dist[2]} L3:${dist[3]}）`);
    for (const q of qs) {
      console.log(`[L${q.variantLevel}] ${q.source ?? "-"} | ${q.type} | 答案: ${q.standardAnswer}`);
      console.log(`  Q: ${q.stem}`);
      if (q.options) console.log(`  O: ${JSON.stringify(q.options)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
