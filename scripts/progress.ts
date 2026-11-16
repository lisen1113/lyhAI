// 题库密度进度：按「变式密度」判断每个技能能否独立支撑一次完整训练
// 判据：专项 5 题（L1×1 + L2×2 + L3×2）+ 独立 2 题（L2/L3），要求 L2≥3 且 L3≥3
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const skills = await p.microSkill.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, code: true, name: true, examWeight: true,
      node: { select: { subject: { select: { code: true } }, parent: { select: { parent: { select: { name: true } } } } } },
    },
    orderBy: { code: "asc" },
  });
  const qs = await p.question.findMany({
    where: { deletedAt: null, microSkillId: { not: null }, isTemplate: false },
    select: { microSkillId: true, variantLevel: true },
  });
  const m = new Map<string, { 1: number; 2: number; 3: number }>();
  for (const q of qs) {
    const k = q.microSkillId!;
    if (!m.has(k)) m.set(k, { 1: 0, 2: 0, 3: 0 });
    const d = m.get(k)!;
    if (q.variantLevel === 1) d[1]++;
    else if (q.variantLevel === 2) d[2]++;
    else d[3]++;
  }
  const rows = skills.map((s) => {
    const d = m.get(s.id) ?? { 1: 0, 2: 0, 3: 0 };
    return {
      code: s.code, name: s.name, sub: s.node.subject.code, w: s.examWeight,
      mod: s.node.parent?.parent?.name ?? "-",
      l1: d[1], l2: d[2], l3: d[3], sum: d[1] + d[2] + d[3],
    };
  });

  const total = await p.question.count({ where: { deletedAt: null } });
  const ph = await p.question.count({ where: { deletedAt: null, subject: { code: "PH" } } });
  const full = rows.filter((r) => r.l2 >= 3 && r.l3 >= 3);
  const lack = rows.filter((r) => !(r.l2 >= 3 && r.l3 >= 3));

  console.log("========== 题库密度进度 ==========");
  console.log(`题目总量 ${total}（物理 ${ph} / 化学 ${total - ph}）｜技能 ${rows.length}`);
  console.log(`达标（L2≥3 且 L3≥3）${full.length}/${rows.length} = ${((full.length / rows.length) * 100).toFixed(0)}%`);
  console.log(`物理达标 ${rows.filter((r) => r.sub === "PH" && r.l2 >= 3 && r.l3 >= 3).length}/${rows.filter((r) => r.sub === "PH").length}`);
  console.log(`化学达标 ${rows.filter((r) => r.sub === "CH" && r.l2 >= 3 && r.l3 >= 3).length}/${rows.filter((r) => r.sub === "CH").length}`);

  if (lack.length) {
    console.log(`\n未达标 ${lack.length} 个（按考试权重降序，需补题数 = 缺口）：`);
    for (const r of lack.sort((a, b) => b.w - a.w)) {
      const need = Math.max(0, 3 - r.l2) + Math.max(0, 3 - r.l3);
      console.log(`  ${r.sub} ${r.code} ${r.name.padEnd(20, " ")} L${r.l1}/${r.l2}/${r.l3} 共${r.sum} 权重${r.w} 需补${need}题`);
    }
  }

  // 按模块汇总，便于按模块批量补题
  console.log("\n========== 模块达标情况 ==========");
  const mods = new Map<string, { n: number; ok: number; sum: number }>();
  for (const r of rows) {
    if (!mods.has(r.mod)) mods.set(r.mod, { n: 0, ok: 0, sum: 0 });
    const b = mods.get(r.mod)!;
    b.n++; b.sum += r.sum;
    if (r.l2 >= 3 && r.l3 >= 3) b.ok++;
  }
  for (const [name, v] of [...mods].sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)) {
    const flag = v.ok === v.n ? "✓" : "·";
    console.log(`  ${flag} ${name.padEnd(16, " ")} 达标 ${v.ok}/${v.n} 题${v.sum}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await p.$disconnect(); });
