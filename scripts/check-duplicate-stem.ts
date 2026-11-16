// 题干重复检查：同一题干出现多次会导致学生连续看到同一道题
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const all = await p.question.findMany({
    where: { deletedAt: null },
    select: { source: true, stem: true, microSkill: { select: { code: true } } },
  });
  const m = new Map<string, { source: string; skill: string }[]>();
  for (const q of all) {
    const k = q.stem.trim();
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push({ source: q.source ?? "?", skill: q.microSkill?.code ?? "-" });
  }
  const dups = [...m.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`========== 题干重复检查（${all.length} 题）==========`);
  if (dups.length === 0) {
    console.log("  [OK] 无重复题干");
  } else {
    for (const [stem, arr] of dups) {
      console.log(`  [FAIL] ${arr.map((a) => a.source).join(" , ")} | ${arr[0].skill}`);
      console.log(`         ${stem.slice(0, 60)}`);
    }
    console.log(`  共 ${dups.length} 组重复`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await p.$disconnect(); });
