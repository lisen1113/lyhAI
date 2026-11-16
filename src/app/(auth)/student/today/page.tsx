import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getTodayPlan } from "@/lib/services/scheduler";
import { prisma } from "@/lib/db";
import TodayPractice from "@/components/student/TodayPractice";

export const dynamic = "force-dynamic";

const SEGMENT_META: Record<string, { name: string; desc: string; icon: string; goal: string }> = {
  WARMUP: { name: "成功热身", desc: "从已经会的题开始，找回状态", icon: "1", goal: "2-3 道熟悉的题，先把手感找回来" },
  REVIEW: { name: "知识复测", desc: "按 1/3/7/14/30 天安排；还没学过时先给一道同单元的预热题", icon: "2", goal: "检验学过的内容还记不记得，学新内容前先热一下" },
  MICRO_LEARN: { name: "微知识学习", desc: "今天只学一个小点，学透它", icon: "3", goal: "5 分钟，看懂一个概念和一个例题" },
  PRACTICE: { name: "专项训练", desc: "同一单元：基础题 → 换问法 → 换情境", icon: "4", goal: "先用原型题把方法用熟，再换问法和情境检验是不是真懂" },
  INDEPENDENT: { name: "独立通关", desc: "不给提示，验证是否真的会了", icon: "5", goal: "不看提示做 2 道题，能自己做出来才算掌握" },
  SUMMARY: { name: "今日总结", desc: "看看今天真正修复了什么", icon: "6", goal: "1 分钟回顾，并告诉我今天的难度感受" },
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const requested = sp.subject === "CH" ? "CH" : sp.subject === "PH" ? "PH" : null;
  const plan = await getTodayPlan(user.id, requested ? { subject: requested as "PH" | "CH" } : undefined);

  // 今日两科进度：被耽误的一科可以切过去补，两科分别记录
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayPlans = await prisma.dailyPlan.findMany({
    where: { studentId: user.id, date: dayStart },
    select: {
      primarySubject: true,
      items: { select: { questionId: true, completedAt: true } },
    },
  });
  const subjectTabs = (["PH", "CH"] as const).map((code) => {
    const p = todayPlans.find((x) => x.primarySubject === code);
    const qItems = p?.items.filter((i) => i.questionId) ?? [];
    return {
      code,
      total: qItems.length,
      completed: qItems.filter((i) => i.completedAt).length,
      active: plan.primarySubject === code,
    };
  });

  const questionItems = plan.items.filter((i) => i.questionId);
  const questions = await prisma.question.findMany({
    where: { id: { in: questionItems.map((i) => i.questionId!) } },
    include: {
      hints: { orderBy: { level: "asc" } },
      knowledgeLinks: { include: { node: true } },
      errorTags: { include: { errorTag: true } },
    },
  });
  const qMap = new Map(questions.map((q) => [q.id, q]));

  const items = plan.items
    .filter((it) => it.questionId)
    .map((it) => {
      const q = qMap.get(it.questionId!);
      if (!q) return null;
      const node = q.knowledgeLinks[0]?.node;
      return {
        itemId: it.id,
        segment: it.segment,
        plannedMinutes: it.plannedMinutes,
        completedAt: it.completedAt ? it.completedAt.toISOString() : null,
        variantLevel: q.variantLevel,
        isTemplate: q.isTemplate,
        nodeName: node?.name ?? "",
        question: {
          id: q.id,
          type: q.type,
          stem: q.stem,
          options: q.options,
          standardAnswer: q.standardAnswer,
          solution: q.solution,
          hints: q.hints
            .filter((h) => h.level <= 3)
            .map((h) => ({ level: h.level, content: h.content })),
          errorTags: q.errorTags.map((et) => ({
            id: et.errorTag.id, name: et.errorTag.name, category: et.errorTag.category,
          })),
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 微知识卡：今天的 1 个技能，含情境/概念/公式/坑/例题
  const learnItem = plan.items.find((i) => i.segment === "MICRO_LEARN");
  let microLesson = null;
  if (learnItem?.microSkillId) {
    const sk = await prisma.microSkill.findUnique({
      where: { id: learnItem.microSkillId },
      include: { node: true },
    });
    if (sk) {
      microLesson = {
        itemId: learnItem.id,
        code: sk.code,
        name: sk.name,
        nodeName: sk.node.name,
        minutes: learnItem.plannedMinutes,
        context: sk.context ?? "",
        coreConcept: sk.coreConcept ?? "",
        formula: sk.formula ?? "",
        pitfalls: Array.isArray(sk.commonPitfalls) ? (sk.commonPitfalls as string[]) : [],
        example: sk.basicExample ?? "",
        completed: !!learnItem.completedAt,
      };
    }
  }

  // 今日主攻节点（用于在总结页说明「今天修复了什么」）
  const focusNodes = Array.from(
    new Set(items.map((i) => i.nodeName).filter(Boolean))
  ).slice(0, 3);

  return (
    <TodayPractice
      planId={plan.id}
      totalMinutes={plan.totalMinutes}
      primarySubject={plan.primarySubject}
      items={JSON.parse(JSON.stringify(items))}
      microLesson={microLesson ? JSON.parse(JSON.stringify(microLesson)) : null}
      segmentMeta={SEGMENT_META}
      focusNodes={focusNodes}
      subjectTabs={subjectTabs}
    />
  );
}
