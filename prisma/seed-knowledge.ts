// 完整知识树 seed（幂等）— 由 knowledge-data.ts 驱动
import { PrismaClient, SubjectCode, NodeLevel, PrereqStrength } from "@prisma/client";
import { PHYSICS_MODULES, CHEMISTRY_MODULES, type ModuleTuple } from "./knowledge-data";

const prisma = new PrismaClient();

async function ensureNode(code: string, data: {
  name: string; level: NodeLevel; subjectId: string; parentId?: string;
  examWeight?: number; repairability?: number; order: number;
}) {
  const existing = await prisma.knowledgeNode.findUnique({ where: { code } });
  if (existing) return existing;
  return prisma.knowledgeNode.create({ data: { code, ...data } });
}

async function seedSubjectModules(subjectCode: SubjectCode, modules: ModuleTuple[]) {
  const subject = await prisma.subject.findUnique({ where: { code: subjectCode } });
  if (!subject) throw new Error(`Subject ${subjectCode} not found. Run base seed first.`);
  const prefix = subjectCode; // PH / CH
  let nodeCount = 0, skillCount = 0, prereqCount = 0;

  for (let mi = 0; mi < modules.length; mi++) {
    const [mCode, mName, units] = modules[mi];
    const moduleCode = `${prefix}-${mCode}`;
    const module = await ensureNode(moduleCode, {
      name: mName, level: NodeLevel.MODULE, subjectId: subject.id, order: mi + 1,
    });
    nodeCount++;

    for (let ui = 0; ui < units.length; ui++) {
      const [uName, nodes] = units[ui];
      const unitCode = `${moduleCode}-U${String(ui + 1).padStart(2, "0")}`;
      const unit = await ensureNode(unitCode, {
        name: uName, level: NodeLevel.UNIT, subjectId: subject.id,
        parentId: module.id, order: ui + 1,
      });
      nodeCount++;

      for (let ki = 0; ki < nodes.length; ki++) {
        const [kName, weight, repairability, prereqCodes, skills] = nodes[ki];
        const kCode = `${unitCode}-K${String(ki + 1).padStart(2, "0")}`;
        const kn = await ensureNode(kCode, {
          name: kName, level: NodeLevel.KNOWLEDGE_NODE, subjectId: subject.id,
          parentId: unit.id, examWeight: weight, repairability, order: ki + 1,
        });
        nodeCount++;

        // 技能
        for (let si = 0; si < skills.length; si++) {
          const [skName, concept, formula, pitfalls] = skills[si];
          const skCode = `${kCode}-S${String(si + 1).padStart(2, "0")}`;
          const existingSk = await prisma.microSkill.findUnique({ where: { code: skCode } });
          if (!existingSk) {
            await prisma.microSkill.create({
              data: {
                code: skCode, name: skName, nodeId: kn.id,
                coreConcept: concept, formula: formula ?? null,
                commonPitfalls: pitfalls ? [pitfalls] : [],
                examWeight: weight, repairability,
              },
            });
            skillCount++;
          }
        }

        // 前置依赖（软前置，默认）
        for (const pc of prereqCodes) {
          const pre = await prisma.knowledgeNode.findUnique({ where: { code: pc } });
          if (pre) {
            const existing = await prisma.knowledgePrerequisite.findFirst({
              where: { nodeId: kn.id, prerequisiteNodeId: pre.id },
            });
            if (!existing) {
              await prisma.knowledgePrerequisite.create({
                data: { nodeId: kn.id, prerequisiteNodeId: pre.id, strength: PrereqStrength.SOFT },
              });
              prereqCount++;
            }
          }
        }
      }
    }
  }
  console.log(`  ${subjectCode}: +${nodeCount} nodes, +${skillCount} skills, +${prereqCount} prereqs`);
  return { nodeCount, skillCount, prereqCount };
}

async function main() {
  console.log("Seeding full knowledge tree...");
  await seedSubjectModules(SubjectCode.PH, PHYSICS_MODULES);
  await seedSubjectModules(SubjectCode.CH, CHEMISTRY_MODULES);

  const nodeTotal = await prisma.knowledgeNode.count();
  const skillTotal = await prisma.microSkill.count();
  const prereqTotal = await prisma.knowledgePrerequisite.count();
  console.log(`Total: ${nodeTotal} nodes, ${skillTotal} skills, ${prereqTotal} prereqs`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
