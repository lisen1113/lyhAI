import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  for (const code of ["PH", "CH"] as const) {
    const all = await p.knowledgeNode.findMany({
      where: { subject: { code } },
      include: { microSkills: true, _count: { select: { questionLinks: true } } },
      orderBy: { code: "asc" },
    });
    const nodes = all.filter((n) => /-K\d+$/.test(n.code));
    const zero = nodes.filter((n) => n._count.questionLinks === 0);
    console.log(`\n${code} K级节点 ${nodes.length}，零题 ${zero.length}`);
    for (const n of nodes) {
      console.log(`  ${n.code} | ${n.name} | 题${n._count.questionLinks} | 技能${n.microSkills.length}`);
    }
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
