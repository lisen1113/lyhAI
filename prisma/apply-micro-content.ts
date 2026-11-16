// 只做微知识卡内容注入（context / basicExample / commonPitfalls），不触碰题目
import { PrismaClient } from "@prisma/client";
import { ALL_SKILL_CONTENT } from "./micro-skill-content";

const p = new PrismaClient();

async function main() {
  const skills = await p.microSkill.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(skills.map((s) => [s.code, s.id]));
  let updated = 0;
  const missing: string[] = [];
  for (const [code, c] of Object.entries(ALL_SKILL_CONTENT)) {
    const id = codeToId.get(code);
    if (!id) { missing.push(code); continue; }
    await p.microSkill.update({
      where: { id },
      data: { context: c.context, basicExample: c.example, commonPitfalls: c.pitfalls },
    });
    updated++;
  }
  console.log(`[micro] 注入 ${updated}/${skills.length}；内容库 ${Object.keys(ALL_SKILL_CONTENT).length} 条`);
  if (missing.length) console.log(`[micro] 内容库中无对应技能: ${missing.join(", ")}`);

  const noContent = await p.microSkill.findMany({
    where: { status: "ACTIVE", OR: [{ context: null }, { context: "" }] },
    select: { code: true, name: true },
  });
  console.log(`[micro] 仍缺情境的技能: ${noContent.length}`);
  for (const s of noContent) console.log(`   ${s.code} ${s.name}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
