// 错因标签体系 seed（幂等）— 严格按开发文档第13节
// 通用：概念不会、概念混淆、漏条件、审题错误、公式选择、公式变形、单位、计算、图像、实验逻辑、表达、记忆、未作答
// 物理增加：电表接法、电路结构、滑动变阻器、控制变量、读数、受力分析、光路
// 化学增加：元素符号、化合价、化学式下标、配平、反应条件、气体/沉淀符号、实验现象与结论、离子检验
import { PrismaClient, ErrorCategory } from "@prisma/client";

const prisma = new PrismaClient();

const TAGS: Array<{ code: string; name: string; category: ErrorCategory }> = [
  // 通用
  { code: "GEN_CONCEPT", name: "概念不会", category: "GENERAL" },
  { code: "GEN_CONFUSE", name: "概念混淆", category: "GENERAL" },
  { code: "GEN_MISS_COND", name: "漏条件", category: "GENERAL" },
  { code: "GEN_MISREAD", name: "审题错误", category: "GENERAL" },
  { code: "GEN_FORMULA", name: "公式选择", category: "GENERAL" },
  { code: "GEN_FORMULA_DEFORM", name: "公式变形", category: "GENERAL" },
  { code: "GEN_UNIT", name: "单位", category: "GENERAL" },
  { code: "GEN_CALC", name: "计算错误", category: "GENERAL" },
  { code: "GEN_GRAPH", name: "图像", category: "GENERAL" },
  { code: "GEN_EXPERIMENT", name: "实验逻辑", category: "GENERAL" },
  { code: "GEN_EXPRESS", name: "表达", category: "GENERAL" },
  { code: "GEN_MEMORY", name: "记忆", category: "GENERAL" },
  { code: "GEN_BLANK", name: "未作答", category: "GENERAL" },
  // 物理
  { code: "PHY_METER", name: "电表接法", category: "PHYSICS" },
  { code: "PHY_CIRCUIT", name: "电路结构", category: "PHYSICS" },
  { code: "PHY_RHEOSTAT", name: "滑动变阻器", category: "PHYSICS" },
  { code: "PHY_CONTROL_VAR", name: "控制变量", category: "PHYSICS" },
  { code: "PHY_READING", name: "读数", category: "PHYSICS" },
  { code: "PHY_FORCE", name: "受力分析", category: "PHYSICS" },
  { code: "PHY_LIGHT_PATH", name: "光路", category: "PHYSICS" },
  // 化学
  { code: "CHE_SYMBOL", name: "元素符号", category: "CHEMISTRY" },
  { code: "CHE_VALENCE", name: "化合价", category: "CHEMISTRY" },
  { code: "CHE_SUBSCRIPT", name: "化学式下标", category: "CHEMISTRY" },
  { code: "CHE_BALANCE", name: "配平", category: "CHEMISTRY" },
  { code: "CHE_CONDITION", name: "反应条件", category: "CHEMISTRY" },
  { code: "CHE_GAS_PRECIP", name: "气体/沉淀符号", category: "CHEMISTRY" },
  { code: "CHE_PHENOMENON", name: "实验现象与结论", category: "CHEMISTRY" },
  { code: "CHE_ION_TEST", name: "离子检验", category: "CHEMISTRY" },
];

async function main() {
  let created = 0;
  for (const t of TAGS) {
    const r = await prisma.errorTag.upsert({
      where: { code: t.code },
      update: { name: t.name, category: t.category },
      create: t,
    });
    if (r) created++;
  }
  const total = await prisma.errorTag.count();
  console.log(`Error tags seeded. Total: ${total} (target 29: 13 general + 7 physics + 9 chemistry)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
