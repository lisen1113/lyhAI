// 成就定义 seed（幂等）
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACHIEVEMENTS = [
  { code: "PERSIST_STAR", name: "坚持之星", description: "连续训练 3 天", icon: "🌟", criteria: { type: "streakDays", value: 3 } },
  { code: "BREAKTHROUGH_STAR", name: "突破之星", description: "首次掌握一个薄弱知识点", icon: "🚀", criteria: { type: "firstMastery", value: 1 } },
  { code: "INDEPENDENT_STAR", name: "独立之星", description: "首次独立完成 10 道题", icon: "⭐", criteria: { type: "firstTryCount", value: 10 } },
  { code: "ERROR_FIXER", name: "纠错之星", description: "修复 5 个曾出错的知识点", icon: "🔧", criteria: { type: "fixedErrors", value: 5 } },
  { code: "EXPERIMENT_MASTER", name: "实验达人", description: "掌握 3 个实验相关技能", icon: "🧪", criteria: { type: "experimentSkills", value: 3 } },
  { code: "CHEM_LANGUAGE", name: "化学语言达人", description: "掌握 5 个化学用语技能", icon: "⚗️", criteria: { type: "chemLangSkills", value: 5 } },
];

async function main() {
  console.log("Seeding achievements...");
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({ where: { code: a.code }, update: {}, create: a });
  }
  console.log(`Total achievements: ${await prisma.achievement.count()}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
