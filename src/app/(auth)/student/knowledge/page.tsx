import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "待点亮", INTRO: "刚接触", LEARNING: "学习中",
  BASIC: "基础掌握", PROFICIENT: "熟练掌握", STABLE: "稳定掌握",
};
const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 border-slate-200 text-slate-300",
  INTRO: "bg-slate-100 border-slate-300 text-slate-500",
  LEARNING: "bg-sky-100 border-sky-300 text-sky-700",
  BASIC: "bg-emerald-100 border-emerald-300 text-emerald-700",
  PROFICIENT: "bg-indigo-100 border-indigo-300 text-indigo-700",
  STABLE: "bg-amber-100 border-amber-300 text-amber-700",
};
const starsOf = (s: string) =>
  s === "STABLE" ? 5 : s === "PROFICIENT" ? 4 : s === "BASIC" ? 3 : s === "LEARNING" ? 2 : s === "INTRO" ? 1 : 0;

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [masteries, subjects] = await Promise.all([
    prisma.studentMastery.findMany({
      where: { studentId: user.id },
      include: { microSkill: true, node: true },
    }),
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
  ]);
  const byNode = new Map(masteries.map((m) => [m.nodeId, m]));

  // 完整知识树：模块 → K 节点（未学的也要展示，才有「解锁」感）
  const subjectTrees = await Promise.all(
    subjects.map(async (sub) => {
      const modules = await prisma.knowledgeNode.findMany({
        where: { subjectId: sub.id, level: "MODULE" },
        orderBy: { order: "asc" },
        include: {
          children: {
            orderBy: { order: "asc" },
            include: {
              children: { orderBy: { order: "asc" }, include: { microSkills: true } },
            },
          },
        },
      });
      return {
        subject: sub,
        modules: modules.map((m) => {
          const kNodes = m.children.flatMap((u) =>
            u.children.map((k) => {
              const mastery = byNode.get(k.id);
              return {
                id: k.id,
                code: k.code,
                name: k.name,
                unitName: u.name,
                skillName: k.microSkills[0]?.name ?? "",
                status: mastery?.status ?? "NOT_STARTED",
                score: Math.round(mastery?.masteryScore ?? 0),
                independent: Math.round(mastery?.independentAccuracy ?? 0),
                sampleCount: mastery?.sampleCount ?? 0,
              };
            })
          );
          return { id: m.id, name: m.name, kNodes };
        }),
      };
    })
  );

  const allNodes = subjectTrees.flatMap((t) => t.modules.flatMap((m) => m.kNodes));
  const lit = allNodes.filter((n) => n.status !== "NOT_STARTED");
  const mastered = allNodes.filter((n) => n.status === "PROFICIENT" || n.status === "STABLE");
  const totalStars = allNodes.reduce((a, n) => a + starsOf(n.status), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">我的知识地图</h1>
        <p className="mt-1 text-sm text-slate-500">
          每个格子是一个知识节点。学过一个就点亮一个，独立做对才会从蓝色变成金色。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="text-2xl font-bold text-brand-700">{lit.length}<span className="text-sm text-slate-400">/{allNodes.length}</span></div>
          <div className="text-xs text-slate-500">已点亮节点</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-emerald-600">{mastered.length}</div>
          <div className="text-xs text-slate-500">已掌握</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-amber-500">{totalStars}</div>
          <div className="text-xs text-slate-500">累计技能星</div>
        </div>
      </div>

      <div className="card bg-brand-50/50">
        <div className="text-xs text-brand-800">
          说明：<span className="mx-1 inline-block h-2 w-2 rounded-full bg-slate-200 align-middle" />待点亮
          <span className="mx-1 inline-block h-2 w-2 rounded-full bg-slate-400 align-middle" />刚接触
          <span className="mx-1 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" />学习中
          <span className="mx-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />基础掌握
          <span className="mx-1 inline-block h-2 w-2 rounded-full bg-indigo-400 align-middle" />熟练掌握
          <span className="mx-1 inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" />稳定掌握
        </div>
      </div>

      {subjectTrees.map((tree) => (
        <div key={tree.subject.id} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">{tree.subject.name}</h2>
          {tree.modules.map((m) => {
            const done = m.kNodes.filter((n) => n.status !== "NOT_STARTED").length;
            const pct = m.kNodes.length ? Math.round((done / m.kNodes.length) * 100) : 0;
            return (
              <div key={m.id} className="card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{m.name}</span>
                  <span className="text-xs text-slate-400">{done}/{m.kNodes.length} · {pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {m.kNodes.map((n) => {
                    const stars = starsOf(n.status);
                    return (
                      <div
                        key={n.id}
                        className={`rounded-xl border p-2 ${STATUS_DOT[n.status] ?? STATUS_DOT.NOT_STARTED}`}
                        title={n.skillName}
                      >
                        <div className="truncate text-xs font-medium">{n.name}</div>
                        <div className="mt-0.5 truncate text-[10px] opacity-70">{n.unitName}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-amber-500">
                            {stars > 0 ? "★".repeat(stars) : "☆"}
                          </span>
                          {n.sampleCount > 0 && (
                            <span className="text-[10px] opacity-60">独立 {n.independent}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
