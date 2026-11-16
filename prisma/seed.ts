import { PrismaClient, Role, SubjectCode, NodeLevel, QuestionType, Difficulty, ReviewStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");

  // ---------- 用户 ----------
  // 真实学生账号（用户指定，密码统一 123456）；测试账号 student1-3 供 E2E 使用
  const adminHash = await bcrypt.hash("Admin@2026", 12);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash: adminHash },
    create: { username: "admin", passwordHash: adminHash, displayName: "管理员", role: Role.ADMIN },
  });

  const students: { username: string; displayName: string; password: string }[] = [
    { username: "liyuhan", displayName: "李语涵", password: "123456" },
    { username: "xule", displayName: "xule", password: "123456" },
    { username: "qinjn", displayName: "qinjn", password: "123456" },
    { username: "student1", displayName: "同学一", password: "Student@2026" },
    { username: "student2", displayName: "同学二", password: "Student@2026" },
    { username: "student3", displayName: "同学三", password: "Student@2026" },
  ];

  const createdStudents = [];
  for (const s of students) {
    const hash = await bcrypt.hash(s.password, 12);
    const u = await prisma.user.upsert({
      where: { username: s.username },
      update: { passwordHash: hash, displayName: s.displayName },
      create: { username: s.username, passwordHash: hash, displayName: s.displayName, role: Role.STUDENT },
    });
    await prisma.studentProfile.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id, grade: 9, nickname: s.displayName },
    });
    createdStudents.push(u);
  }

  // ---------- 学习小组（合作目标） ----------
  const group = await prisma.studyGroup.upsert({
    where: { id: "seed-group-001" },
    update: {},
    create: {
      id: "seed-group-001",
      name: "一模冲刺小队",
      goal: "本周共同修复 30 个知识点",
    },
  });
  for (const u of createdStudents) {
    await prisma.studentGroup.upsert({
      where: { groupId_studentId: { groupId: group.id, studentId: u.id } },
      update: {},
      create: { groupId: group.id, studentId: u.id },
    });
  }

  // ---------- 学科 ----------
  const physics = await prisma.subject.upsert({
    where: { code: SubjectCode.PH },
    update: {},
    create: { code: SubjectCode.PH, name: "物理" },
  });
  const chemistry = await prisma.subject.upsert({
    where: { code: SubjectCode.CH },
    update: {},
    create: { code: SubjectCode.CH, name: "化学" },
  });

  // ---------- 基础知识树（示例：物理力与运动、化学空气氧气） ----------
  // 物理 PH-M07 力
  let phM07 = await prisma.knowledgeNode.findUnique({ where: { code: "PH-M07" } });
  if (!phM07) {
    phM07 = await prisma.knowledgeNode.create({
      data: { code: "PH-M07", name: "力", level: NodeLevel.MODULE, subjectId: physics.id, order: 7 },
    });
  }
  let phM07U02 = await prisma.knowledgeNode.findUnique({ where: { code: "PH-M07-U02" } });
  if (!phM07U02) {
    phM07U02 = await prisma.knowledgeNode.create({
      data: { code: "PH-M07-U02", name: "力", level: NodeLevel.UNIT, subjectId: physics.id, parentId: phM07.id, order: 2 },
    });
  }
  let gravity = await prisma.knowledgeNode.findUnique({ where: { code: "PH-M07-U02-K03" } });
  if (!gravity) {
    gravity = await prisma.knowledgeNode.create({
      data: {
        code: "PH-M07-U02-K03", name: "重力", level: NodeLevel.KNOWLEDGE_NODE,
        subjectId: physics.id, parentId: phM07U02.id, examWeight: 0.9, repairability: 0.9, order: 3,
      },
    });
  }
  await prisma.microSkill.upsert({
    where: { code: "PH-M07-U02-K03-S02" },
    update: {},
    create: {
      code: "PH-M07-U02-K03-S02", name: "重力大小 G=mg", nodeId: gravity.id,
      context: "为什么质量不同的物体重力不同？",
      coreConcept: "物体所受重力与质量成正比，G=mg，g≈9.8N/kg，方向竖直向下",
      formula: "G = m · g",
      commonPitfalls: ["把质量 m 与重力 G 混用", "g 单位取错", "忽略方向"],
      basicExample: "质量 2kg 的物体受到的重力是多少？（G=2×9.8=19.6N）",
      examWeight: 0.85, repairability: 0.9,
    },
  });

  // 化学 CH-M03 空气与氧气
  let chM03 = await prisma.knowledgeNode.findUnique({ where: { code: "CH-M03" } });
  if (!chM03) {
    chM03 = await prisma.knowledgeNode.create({
      data: { code: "CH-M03", name: "空气与氧气", level: NodeLevel.MODULE, subjectId: chemistry.id, order: 3 },
    });
  }
  let oxygen = await prisma.knowledgeNode.findUnique({ where: { code: "CH-M03-K02" } });
  if (!oxygen) {
    oxygen = await prisma.knowledgeNode.create({
      data: {
        code: "CH-M03-K02", name: "氧气的性质", level: NodeLevel.KNOWLEDGE_NODE,
        subjectId: chemistry.id, parentId: chM03.id, examWeight: 0.8, repairability: 0.85, order: 2,
      },
    });
  }
  await prisma.microSkill.upsert({
    where: { code: "CH-M03-K02-S01" },
    update: {},
    create: {
      code: "CH-M03-K02-S01", name: "氧气的助燃性", nodeId: oxygen.id,
      context: "带火星木条伸入集气瓶为什么会复燃？",
      coreConcept: "氧气具有助燃性，能支持燃烧，但本身不可燃",
      commonPitfalls: ["把助燃性说成可燃性", "混淆氧气与氢气性质"],
      basicExample: "如何检验一瓶气体是否为氧气？（带火星木条复燃）",
      examWeight: 0.8, repairability: 0.85,
    },
  });

  // ---------- 错因标签 ----------
  const errorTags = [
    { code: "GEN_CONCEPT", name: "概念不会", category: "GENERAL" as const },
    { code: "GEN_CONFUSE", name: "概念混淆", category: "GENERAL" as const },
    { code: "GEN_FORMULA", name: "公式选择", category: "GENERAL" as const },
    { code: "GEN_CALC", name: "计算错误", category: "GENERAL" as const },
    { code: "PHY_FORCE", name: "受力分析", category: "PHYSICS" as const },
    { code: "CHE_SYMBOL", name: "元素符号", category: "CHEMISTRY" as const },
  ];
  for (const tag of errorTags) {
    await prisma.errorTag.upsert({
      where: { code: tag.code },
      update: {},
      create: tag,
    });
  }

  // ---------- 测试题（已审核，供 Phase 4 训练引擎使用） ----------
  const q1 = await prisma.question.upsert({
    where: { id: "seed-q-ph-001" },
    update: {},
    create: {
      id: "seed-q-ph-001",
      subjectId: physics.id,
      type: QuestionType.NUMERIC,
      difficulty: Difficulty.L1,
      stem: "一个质量为 2kg 的物体受到的重力是多少牛顿？（g 取 9.8N/kg）",
      standardAnswer: "19.6N",
      solution: "已知 m=2kg，g=9.8N/kg。根据 G=mg，G=2×9.8=19.6N。方向竖直向下。",
      estimatedTime: 45,
      source: "seed",
      reviewStatus: ReviewStatus.PUBLISHED,
    },
  });
  await prisma.questionHint.createMany({
    data: [
      { questionId: q1.id, level: 1, content: "想一想重力与质量之间有什么关系？" },
      { questionId: q1.id, level: 2, content: "重力的方向是竖直向下，大小与质量成正比。" },
      { questionId: q1.id, level: 3, content: "使用公式 G = m · g，其中 g = 9.8 N/kg。" },
      { questionId: q1.id, level: 4, content: "完整解析：已知 m=2kg，g=9.8N/kg。由 G=mg 得 G=2×9.8=19.6N，方向竖直向下。常见错误：把质量当重力、忘记单位。" },
    ],
    skipDuplicates: true,
  });
  await prisma.questionKnowledge.upsert({
    where: { questionId_nodeId: { questionId: q1.id, nodeId: gravity.id } },
    update: {},
    create: { questionId: q1.id, nodeId: gravity.id, isPrimary: true },
  });

  const q2 = await prisma.question.upsert({
    where: { id: "seed-q-ch-001" },
    update: {},
    create: {
      id: "seed-q-ch-001",
      subjectId: chemistry.id,
      type: QuestionType.SINGLE_CHOICE,
      difficulty: Difficulty.L1,
      stem: "检验一瓶气体是否为氧气，常用的方法是：",
      options: JSON.stringify([
        { key: "A", text: "倒入澄清石灰水" },
        { key: "B", text: "将带火星的木条伸入瓶中" },
        { key: "C", text: "闻气味" },
        { key: "D", text: "观察颜色" },
      ]),
      standardAnswer: "B",
      solution: "氧气具有助燃性，能使带火星的木条复燃，这是检验氧气的常用方法。",
      estimatedTime: 30,
      source: "seed",
      reviewStatus: ReviewStatus.PUBLISHED,
    },
  });
  await prisma.questionHint.createMany({
    data: [
      { questionId: q2.id, level: 1, content: "氧气有什么特有的化学性质？" },
      { questionId: q2.id, level: 2, content: "氧气能支持燃烧（助燃性）。" },
      { questionId: q2.id, level: 3, content: "带火星的木条在氧气中会复燃。" },
      { questionId: q2.id, level: 4, content: "完整解析：氧气具有助燃性，带火星木条伸入后复燃即为氧气。注意氧气本身不可燃。" },
    ],
    skipDuplicates: true,
  });
  await prisma.questionKnowledge.upsert({
    where: { questionId_nodeId: { questionId: q2.id, nodeId: oxygen.id } },
    update: {},
    create: { questionId: q2.id, nodeId: oxygen.id, isPrimary: true },
  });

  console.log("Seed complete.");
  console.log({ admin: admin.username, students: createdStudents.map((s) => s.username) });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
