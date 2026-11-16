import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStudentMetrics, getKnowledgeHeatmap, getTrends } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

function scoreColor(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 60) return "bg-lime-500";
  if (score >= 40) return "bg-amber-400";
  if (score > 0) return "bg-orange-400";
  return "bg-slate-200";
}

export default async function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const student = await prisma.user.findUnique({
    where: { id: studentId }, include: { studentProfile: true },
  });
  if (!student || student.role !== "STUDENT") notFound();

  const [metrics, heatmap, trends] = await Promise.all([
    getStudentMetrics(studentId), getKnowledgeHeatmap(studentId), getTrends(studentId),
  ]);

  const topErrors = await prisma.studentError.findMany({
    where: { studentId }, include: { errorTag: true }, orderBy: { occurredAt: "desc" }, take: 200,
  });
  const errCount: Record<string, { name: string; count: number }> = {};
  topErrors.forEach((e) => {
    if (!errCount[e.errorTagId]) errCount[e.errorTagId] = { name: e.errorTag.name, count: 0 };
    errCount[e.errorTagId].count++;
  });
  const errors = Object.values(errCount).sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{student.displayName} · 学习详情</h1>
        <p className="mt-1 text-sm text-slate-500">@{student.username} · 年级 {student.studentProfile?.grade ?? "-"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card"><div className="text-xs text-slate-500">一模准备度</div><div className="mt-1 text-2xl font-bold text-brand-700">{metrics.readiness}</div></div>
        <div className="card"><div className="text-xs text-slate-500">独立率</div><div className="mt-1 text-2xl font-bold text-emerald-600">{metrics.independentRate}%</div></div>
        <div className="card"><div className="text-xs text-slate-500">提示依赖</div><div className="mt-1 text-2xl font-bold text-slate-700">{metrics.hintDependency}%</div></div>
        <div className="card"><div className="text-xs text-slate-500">本周天数</div><div className="mt-1 text-2xl font-bold text-slate-700">{metrics.weekDays}</div></div>
      </div>

      {/* 趋势 */}
      <div className="card">
        <h2 className="mb-3 font-semibold text-slate-800">独立率 / 提示依赖趋势</h2>
        {trends.length === 0 ? <p className="text-sm text-slate-500">暂无数据</p> : (
          <div className="space-y-1.5">
            {trends.slice(-14).map((t) => (
              <div key={t.date} className="flex items-center gap-3 text-xs">
                <span className="w-20 text-slate-500">{t.date.slice(5)}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-emerald-500" style={{ width: `${t.independent}%` }} />
                </div>
                <span className="w-10 text-right text-emerald-700">{t.independent}%</span>
                <div className="h-4 w-16 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-amber-400" style={{ width: `${t.hint}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 知识热力图 */}
      <div className="card">
        <h2 className="mb-3 font-semibold text-slate-800">知识掌握热力图</h2>
        {heatmap.length === 0 ? <p className="text-sm text-slate-500">暂无数据</p> : (
          <div className="flex flex-wrap gap-1.5">
            {heatmap.map((h) => (
              <div key={h.code} className={`flex h-9 w-9 items-center justify-center rounded text-[10px] font-medium text-white ${scoreColor(h.score)}`} title={`${h.name}: ${h.score}`}>
                {h.score}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-3 text-[10px] text-slate-500">
          <span><span className="inline-block h-2.5 w-2.5 rounded bg-slate-200" /> 未学</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded bg-orange-400" /> 初学</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded bg-amber-400" /> 学习中</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded bg-lime-500" /> 掌握</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded bg-emerald-500" /> 熟练</span>
        </div>
      </div>

      {/* 高频错因 + 薄弱点 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">高频错因</h2>
          {errors.length === 0 ? <p className="text-sm text-slate-500">暂无数据</p> : errors.map((e) => (
            <div key={e.name} className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-700">{e.name}</span>
              <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">{e.count} 次</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">最大薄弱点</h2>
          {metrics.weak.length === 0 ? <p className="text-sm text-slate-500">暂无数据</p> : metrics.weak.map((w) => (
            <div key={w} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</div>
          ))}
          <h3 className="mb-2 mt-4 font-semibold text-slate-800">下一阶段重点</h3>
          <p className="text-sm text-slate-500">系统已按优先级公式自动调度，重点放在到期复测与高频错因对应的知识点。</p>
        </div>
      </div>
    </div>
  );
}
