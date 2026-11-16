// 近似重复题干检查：完全相同的题干由 check-duplicate-stem 拦截；
// 本脚本用二元字组 Jaccard 相似度，找出「句式几乎一样、只换了一两个词」的题组。
// 这类题学生连续遇到会觉得在刷同一道题，必须改写提问角度而不是删题。
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const THRESH = 0.82; // 相似度阈值

// 豁免名单：这些技能的题目本身就是「同一算法 + 不同输入」的刻意练习，
// 题干相似是设计意图而非缺陷（例如反复计算不同化学式的相对分子质量）。
const WHITELIST = new Map<string, string>([
  ["CH-M06-U01-K03-S01", "相对分子质量计算：同一算法换不同化学式，属刻意练习"],
  ["CH-M07-U02-K02-S01", "化学方程式配平：同一方法换不同方程式，属刻意练习"],
]);

type Row = {
  id: string;
  stem: string;
  source: string | null;
  variantLevel: number;
  skillCode: string;
};

function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s，。、；：？！“”‘’（）()《》·,.:;?!\-—]/g, "");
  const g = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
  return g;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

async function main() {
  const raw = await p.question.findMany({
    where: { deletedAt: null, microSkillId: { not: null }, isTemplate: false },
    select: {
      id: true,
      stem: true,
      source: true,
      variantLevel: true,
      microSkill: { select: { code: true } },
    },
  });

  const rows: Row[] = raw.map((q) => ({
    id: q.id,
    stem: q.stem,
    source: q.source,
    variantLevel: q.variantLevel,
    skillCode: q.microSkill?.code ?? "-",
  }));

  // 只在同一技能内部比较：跨技能题干相似往往合理（同一情境复用）
  const bySkill = new Map<string, Row[]>();
  for (const r of rows) {
    if (!bySkill.has(r.skillCode)) bySkill.set(r.skillCode, []);
    bySkill.get(r.skillCode)!.push(r);
  }

  const lines: string[] = [];
  let pairs = 0;
  let waived = 0;
  for (const [code, list] of bySkill) {
    if (WHITELIST.has(code)) {
      waived++;
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const s = jaccard(bigrams(a.stem), bigrams(b.stem));
        if (s >= THRESH) {
          pairs++;
          lines.push(
            `[相似 ${(s * 100).toFixed(0)}%] ${code}\n` +
              `   L${a.variantLevel} ${a.source ?? "?"} | ${a.stem}\n` +
              `   L${b.variantLevel} ${b.source ?? "?"} | ${b.stem}`,
          );
        }
      }
    }
  }

  console.log(`========== 近似重复题干检查（${rows.length} 题，阈值 ${THRESH * 100}%）==========`);
  if (waived > 0) {
    for (const [code, why] of WHITELIST) {
      if (bySkill.has(code)) console.log(`  [豁免] ${code} — ${why}`);
    }
  }
  if (pairs === 0) {
    console.log("  [OK] 无近似重复题干");
  } else {
    console.log(`  发现 ${pairs} 组近似重复，建议改写其中一题的提问角度：\n`);
    for (const l of lines) console.log(l + "\n");
    process.exitCode = 1;
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
