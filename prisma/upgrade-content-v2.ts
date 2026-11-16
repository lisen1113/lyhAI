// 内容升级 v2：微知识卡内容注入 + 模板题收敛 + 变式层级 + 微技能归属
// 幂等：可重复执行。
import { PrismaClient } from "@prisma/client";
import { ALL_SKILL_CONTENT } from "./micro-skill-content";

const prisma = new PrismaClient();

/** 题干规范化：去掉数值与空白，用于识别「换数字」模板 */
function normStem(s: string): string {
  return s
    .replace(/[0-9]+(?:[.．][0-9]+)?/g, "#")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .slice(0, 60);
}

async function injectMicroContent() {
  const skills = await prisma.microSkill.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(skills.map((s) => [s.code, s.id]));
  let updated = 0;
  let missing: string[] = [];
  for (const [code, c] of Object.entries(ALL_SKILL_CONTENT)) {
    const id = codeToId.get(code);
    if (!id) {
      missing.push(code);
      continue;
    }
    await prisma.microSkill.update({
      where: { id },
      data: {
        context: c.context,
        basicExample: c.example,
        commonPitfalls: c.pitfalls,
      },
    });
    updated++;
  }
  const total = skills.length;
  console.log(`[micro] 内容注入 ${updated}/${total} 个技能；内容库条目 ${Object.keys(ALL_SKILL_CONTENT).length}`);
  if (missing.length) console.log(`[micro] 内容库中无对应技能（忽略）: ${missing.join(", ")}`);
  const noContent = await prisma.microSkill.findMany({
    where: { OR: [{ context: null }, { basicExample: null }] },
    select: { code: true, name: true },
  });
  console.log(`[micro] 仍缺内容的技能 ${noContent.length} 个`, noContent.map((s) => s.code).join(","));
  return { updated, total, noContent };
}

async function convergeTemplates() {
  const questions = await prisma.question.findMany({
    where: { deletedAt: null },
    select: {
      id: true, stem: true, difficulty: true, source: true, createdAt: true,
      knowledgeLinks: { select: { nodeId: true, isPrimary: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, typeof questions>();
  for (const q of questions) {
    const k = normStem(q.stem);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(q);
  }

  const templateGroupCount = [...groups.values()].filter((g) => g.length > 1).length;
  let archived = 0;
  let templateKept = 0;

  for (const [, arr] of groups) {
    if (arr.length <= 1) continue;
    // 「换数字」模板组：按难度降序（保留更有区分度的 3 道），同难度保留最早创建
    const sorted = [...arr].sort((a, b) => {
      const rank = { L3: 3, L2: 2, L1: 1 } as Record<string, number>;
      const d = (rank[b.difficulty] ?? 0) - (rank[a.difficulty] ?? 0);
      if (d !== 0) return d;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = sorted.slice(0, 3);
    const drop = sorted.slice(3);
    for (const q of keep) {
      await prisma.question.update({ where: { id: q.id }, data: { isTemplate: true, variantLevel: 1 } });
      templateKept++;
    }
    for (const q of drop) {
      await prisma.question.update({
        where: { id: q.id },
        data: { deletedAt: new Date(), reviewStatus: "REJECTED" },
      });
      archived++;
    }
  }
  console.log(`[bank] 模板组 ${templateGroupCount} 组；保留 ${templateKept} 道，软删除 ${archived} 道（每组最多保留3道不同数值）`);
  return { templateGroupCount, templateKept, archived };
}

async function assignVariantAndSkill() {
  const questions = await prisma.question.findMany({
    where: { deletedAt: null },
    select: {
      id: true, difficulty: true, isTemplate: true,
      knowledgeLinks: { select: { nodeId: true, isPrimary: true }, orderBy: { isPrimary: "desc" } },
    },
  });
  const nodes = await prisma.knowledgeNode.findMany({
    where: { level: "KNOWLEDGE_NODE" },
    select: { id: true, microSkills: { select: { id: true } } },
  });
  const nodeToSkill = new Map(nodes.map((n) => [n.id, n.microSkills[0]?.id ?? null]));

  const levelOf = (d: string) => (d === "L3" ? 3 : d === "L2" ? 2 : 1);
  let touched = 0;
  let noSkill = 0;
  for (const q of questions) {
    const link = q.knowledgeLinks[0];
    const skillId = link ? nodeToSkill.get(link.nodeId) ?? null : null;
    if (!skillId) noSkill++;
    await prisma.question.update({
      where: { id: q.id },
      data: {
        variantLevel: q.isTemplate ? 1 : levelOf(q.difficulty),
        microSkillId: skillId,
      },
    });
    touched++;
  }
  console.log(`[bank] 回填变式层级与微技能 ${touched} 题；无微技能归属 ${noSkill} 题`);
  return { touched, noSkill };
}

async function cleanupDuplicateSkills() {
  // 早期 seed 手工创建的重复节点/技能（层级不规范），确认无引用后删除
  const dupCodes = ["CH-M03-K02-S01", "PH-M07-U02-K03-S02"];
  for (const code of dupCodes) {
    const sk = await prisma.microSkill.findUnique({
      where: { code },
      include: { _count: { select: { masteries: true, questions: true } } },
    });
    if (!sk) continue;
    if (sk._count.masteries === 0 && sk._count.questions === 0) {
      await prisma.microSkill.delete({ where: { id: sk.id } });
      console.log(`[clean] 删除重复技能 ${code}`);
    } else {
      console.log(`[clean] 跳过 ${code}（仍有引用）`);
    }
  }
  // 同时清理这两个节点残留（CH-M03-K02 / PH-M07-U02-K03 若仍存在且无子节点、无题目）
  for (const nodeCode of ["CH-M03-K02", "PH-M07-U02-K03"]) {
    const node = await prisma.knowledgeNode.findUnique({
      where: { code: nodeCode },
      include: { _count: { select: { children: true, questionLinks: true, microSkills: true } } },
    });
    if (!node) continue;
    if (node._count.children === 0 && node._count.questionLinks === 0 && node._count.microSkills === 0) {
      await prisma.knowledgeNode.delete({ where: { id: node.id } });
      console.log(`[clean] 删除重复节点 ${nodeCode}`);
    }
  }
}

async function main() {
  console.log("=== 内容升级 v2 ===");
  const micro = await injectMicroContent();
  const bank = await convergeTemplates();
  const variant = await assignVariantAndSkill();
  await cleanupDuplicateSkills();

  const [qTotal, ph, ch, skills, withCtx] = await Promise.all([
    prisma.question.count({ where: { deletedAt: null } }),
    prisma.question.count({ where: { deletedAt: null, subject: { code: "PH" } } }),
    prisma.question.count({ where: { deletedAt: null, subject: { code: "CH" } } }),
    prisma.microSkill.count(),
    prisma.microSkill.count({ where: { AND: [{ context: { not: null } }, { basicExample: { not: null } }] } }),
  ]);
  console.log("=== 汇总 ===");
  console.log({ 题目总数: qTotal, 物理: ph, 化学: ch, 微技能: skills, 微技能有内容: withCtx, ...micro, ...bank, ...variant });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
