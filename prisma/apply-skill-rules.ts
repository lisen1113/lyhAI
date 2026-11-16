// 补齐微知识卡「公式/规则」与偏薄的核心概念；同时把关键前置关系升级为 HARD 阻断。
import { PrismaClient } from "@prisma/client";
import { SKILL_RULES } from "./micro-skill-rules";

const p = new PrismaClient();

// 文档要求前置知识区分 HARD（阻断）与 SOFT（降权）：
// 只有「不会前者就根本做不了后者」的关系才标 HARD，避免过度阻断。
const HARD_PREREQS: Array<[string, string]> = [
  // [前置节点, 后继节点]
  ["PH-M06-U01-K01", "PH-M06-U01-K02"], // 密度概念 → 密度的测量
  ["PH-M07-U01-K01", "PH-M09-U01-K01"], // 力的概念 → 压强
  ["PH-M07-U01-K01", "PH-M08-U01-K01"], // 力的概念 → 牛顿第一定律
  ["PH-M12-U01-K01", "PH-M12-U01-K03"], // 功 → 机械效率
  ["PH-M15-U02-K01", "PH-M15-U02-K02"], // 电路连接 → 电流与电压
  ["PH-M15-U02-K02", "PH-M16-U01-K01"], // 电流与电压 → 电阻
  ["PH-M17-U01-K01", "PH-M18-U01-K01"], // 欧姆定律 → 电功
  ["PH-M16-U01-K01", "PH-M17-U01-K01"], // 电阻 → 欧姆定律
  ["CH-M05-U01-K02", "CH-M05-U01-K03"], // 原子 → 离子
  ["CH-M06-U01-K01", "CH-M06-U01-K02"], // 化合价 → 化学式书写
  ["CH-M07-U02-K01", "CH-M07-U02-K02"], // 方程式书写 → 配平
  ["CH-M07-U02-K02", "CH-M07-U02-K04"], // 配平 → 根据方程式计算
  ["CH-M09-U01-K02", "CH-M09-U01-K03"], // 金属化学性质 → 金属活动性
  ["CH-M10-U01-K01", "CH-M10-U02-K02"], // 溶液的形成 → 溶质质量分数
  ["CH-M11-U02-K01", "CH-M11-U02-K02"], // 常见的盐 → 复分解反应
];

async function main() {
  console.log("========== 1. 补齐公式 / 规则 ==========");
  const skills = await p.microSkill.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, coreConcept: true, formula: true },
  });
  const byCode = new Map(skills.map((s) => [s.code, s]));

  let ruleFilled = 0, ruleSkipped = 0, conceptUpgraded = 0;
  const missingKey: string[] = [];

  for (const [code, r] of Object.entries(SKILL_RULES)) {
    const s = byCode.get(code);
    if (!s) { missingKey.push(code); continue; }
    const data: { formula?: string; coreConcept?: string } = {};
    if ((s.formula ?? "").trim().length < 2) {
      data.formula = r.rule;
      ruleFilled++;
    } else {
      ruleSkipped++;
    }
    if (r.concept && (s.coreConcept ?? "").trim().length < 15) {
      data.coreConcept = r.concept;
      conceptUpgraded++;
    }
    if (Object.keys(data).length) {
      await p.microSkill.update({ where: { id: s.id }, data });
    }
  }
  console.log(`  写入规则 ${ruleFilled} 条｜已有规则跳过 ${ruleSkipped} 条｜升级核心概念 ${conceptUpgraded} 条`);
  if (missingKey.length) console.log(`  [警告] 题库中不存在的技能码: ${missingKey.join(", ")}`);

  console.log("\n========== 2. 前置关系分级（HARD 阻断 / SOFT 降权） ==========");
  const nodes = await p.knowledgeNode.findMany({ select: { id: true, code: true } });
  const nodeByCode = new Map(nodes.map((n) => [n.code, n.id]));
  let hardSet = 0;
  for (const [pre, next] of HARD_PREREQS) {
    const pid = nodeByCode.get(pre), nid = nodeByCode.get(next);
    if (!pid || !nid) { console.log(`  [跳过] 节点不存在: ${pre} -> ${next}`); continue; }
    const r = await p.knowledgePrerequisite.updateMany({
      where: { nodeId: nid, prerequisiteNodeId: pid },
      data: { strength: "HARD" },
    });
    if (r.count === 0) {
      await p.knowledgePrerequisite.create({
        data: { nodeId: nid, prerequisiteNodeId: pid, strength: "HARD" },
      });
      console.log(`  [新建HARD] ${pre} -> ${next}`);
    } else {
      console.log(`  [升级HARD] ${pre} -> ${next}`);
    }
    hardSet++;
  }
  const hardCount = await p.knowledgePrerequisite.count({ where: { strength: "HARD" } });
  const softCount = await p.knowledgePrerequisite.count({ where: { strength: "SOFT" } });
  console.log(`  HARD ${hardCount} 条 / SOFT ${softCount} 条（共 ${hardCount + softCount}）`);

  console.log("\n========== 3. 复核 ==========");
  const after = await p.microSkill.findMany({
    where: { status: "ACTIVE" },
    select: { code: true, context: true, coreConcept: true, formula: true, commonPitfalls: true, basicExample: true },
  });
  const cnt = (f: (s: typeof after[number]) => boolean) => after.filter(f).length;
  console.log(`  技能总数 ${after.length}`);
  console.log(`  情境 ${cnt((s) => (s.context ?? "").trim().length >= 10)}`);
  console.log(`  核心概念 ${cnt((s) => (s.coreConcept ?? "").trim().length >= 15)}`);
  console.log(`  公式/规则 ${cnt((s) => (s.formula ?? "").trim().length >= 2)}`);
  console.log(`  常见坑≥2 ${cnt((s) => Array.isArray(s.commonPitfalls) && (s.commonPitfalls as unknown[]).length >= 2)}`);
  console.log(`  基础例题 ${cnt((s) => (s.basicExample ?? "").trim().length >= 20)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
