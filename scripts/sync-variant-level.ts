// 按题库源文件的 tier 字段同步数据库里的 variantLevel。
// 背景：seed-question-bank-v2.ts 建题时没有写 variantLevel，走数据库默认值 1，
// 导致该批次题目的变式层级只能靠一次性回填补齐；只要重导其中一题就会退回 L1。
// 本脚本以源文件的 tier（原型/轻变式/情境变式）为唯一事实来源，幂等修正全库。
// 用法：npx tsx scripts/sync-variant-level.ts [--dry]
import { PrismaClient } from "@prisma/client";

import { QUESTION_BANK_V2 } from "../prisma/question-bank-v2";
import { EXT } from "../prisma/question-bank-v2-ext";
import { V3 } from "../prisma/question-bank-v3";
import { V4 } from "../prisma/question-bank-v4";
import { V5_PHYSICS } from "../prisma/question-bank-v5-physics";
import { V6_CHEMISTRY } from "../prisma/question-bank-v6-chemistry";
import { V7 } from "../prisma/question-bank-v7";
import { V8 } from "../prisma/question-bank-v8";
import { V9 } from "../prisma/question-bank-v9";
import { V10 } from "../prisma/question-bank-v10";
import { V11 } from "../prisma/question-bank-v11";
import { V12_PHYSICS } from "../prisma/question-bank-v12-physics";
import { V12_CHEMISTRY } from "../prisma/question-bank-v12-chemistry";
import { V13_ELECTRICITY } from "../prisma/question-bank-v13-electricity";
import { V14_MECHANICS } from "../prisma/question-bank-v14-mechanics";
import { V14_OPTICS_HEAT } from "../prisma/question-bank-v14-optics-heat";
import { V15_CHEM_A } from "../prisma/question-bank-v15-chem-a";
import { V15_CHEM_B } from "../prisma/question-bank-v15-chem-b";
import { V15_CHEM_C } from "../prisma/question-bank-v15-chem-c";
import { V16_CHEM } from "../prisma/question-bank-v16-chem";
import { V17_CHEM } from "../prisma/question-bank-v17-chem";
import { V18_PHYSICS_A } from "../prisma/question-bank-v18-physics-a";
import { V19_PHYSICS_B } from "../prisma/question-bank-v19-physics-b";
import { V19_PHYSICS_C } from "../prisma/question-bank-v19-physics-c";
import { V20_PHYSICS_D } from "../prisma/question-bank-v20-physics-d";
import { V20_PHYSICS_E } from "../prisma/question-bank-v20-physics-e";
import { V21_PHYSICS_FIX } from "../prisma/question-bank-v21-physics-fix";
import { generateQuestions } from "../prisma/question-data";
import type { Q2 } from "../prisma/question-bank-v2";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

const TIER_LEVEL: Record<Q2["tier"], number> = { 原型: 1, 轻变式: 2, 情境变式: 3 };

const BANK: Q2[] = [
  ...QUESTION_BANK_V2, ...EXT, ...V3, ...V4,
  ...V5_PHYSICS, ...V6_CHEMISTRY, ...V7, ...V8, ...V9, ...V10, ...V11,
  ...V12_PHYSICS, ...V12_CHEMISTRY, ...V13_ELECTRICITY,
  ...V14_MECHANICS, ...V14_OPTICS_HEAT,
  ...V15_CHEM_A, ...V15_CHEM_B, ...V15_CHEM_C,
  ...V16_CHEM, ...V17_CHEM,
  ...V18_PHYSICS_A, ...V19_PHYSICS_B, ...V19_PHYSICS_C,
  ...V20_PHYSICS_D, ...V20_PHYSICS_E, ...V21_PHYSICS_FIX,
];

async function main() {
  const expected = new Map<string, number>();
  for (const item of BANK) expected.set(item.key, TIER_LEVEL[item.tier]);

  // 生成器题库（seed-questions.ts 产出的 PQ-*/CQ-*）没有 tier 字段，只有 difficulty。
  // 这类题以难度作为变式层级依据：L1→原型、L2→轻变式、L3→情境变式。
  // 不纳入这里会导致整批题退回默认 L1，专项训练就选不出 L2/L3 题。
  const DIFF_LEVEL: Record<string, number> = { L1: 1, L2: 2, L3: 3 };
  const generated = generateQuestions();
  for (const g of generated) expected.set(g.key, DIFF_LEVEL[g.difficulty] ?? 1);

  const rows = await prisma.question.findMany({
    where: { deletedAt: null, source: { not: null } },
    select: { id: true, source: true, variantLevel: true },
  });

  const fixes: { id: string; source: string; from: number; to: number }[] = [];
  let unknown = 0;
  for (const r of rows) {
    const want = expected.get(r.source!);
    if (want === undefined) {
      unknown++;
      continue;
    }
    if (r.variantLevel !== want) {
      fixes.push({ id: r.id, source: r.source!, from: r.variantLevel, to: want });
    }
  }

  console.log("========== 变式层级同步 ==========");
  console.log(
    `源文件题目 ${BANK.length}｜生成器题目 ${generated.length}｜数据库题目 ${rows.length}｜源文件中查不到 ${unknown}`
  );
  console.log(`需要修正 ${fixes.length} 条`);

  for (const f of fixes.slice(0, 40)) {
    console.log(`  ${f.source}  L${f.from} → L${f.to}`);
  }
  if (fixes.length > 40) console.log(`  ...另外 ${fixes.length - 40} 条`);

  if (DRY) {
    console.log("\n[--dry] 只预览，未写入数据库");
    return;
  }
  for (const f of fixes) {
    await prisma.question.update({ where: { id: f.id }, data: { variantLevel: f.to } });
  }
  console.log(`\n已修正 ${fixes.length} 条`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
