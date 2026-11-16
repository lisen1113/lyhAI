import Link from "next/link";
import { prisma } from "@/lib/db";
import { getStudentMetrics, listRealStudents } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const students = await listRealStudents();
  const metrics = await Promise.all(students.map((s) => getStudentMetrics(s.id)));
  const knowledgeCount = await prisma.knowledgeNode.count();
  const questionCount = await prisma.question.count({ where: { deletedAt: null } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">总览</h1>
        <p className="mt-1 text-sm text-slate-500">只看结果，不参与日常教学。数据客观呈现，但不做学生间排名。</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card"><div className="text-sm text-slate-500">学生</div><div className="mt-1 text-3xl font-bold text-slate-800">{students.length}</div></div>
        <div className="card"><div className="text-sm text-slate-500">知识节点</div><div className="mt-1 text-3xl font-bold text-slate-800">{knowledgeCount}</div></div>
        <div className="card"><div className="text-sm text-slate-500">题库</div><div className="mt-1 text-3xl font-bold text-slate-800">{questionCount}</div></div>
        <div className="card"><div className="text-sm text-slate-500">系统状态</div><div className="mt-1 text-lg font-semibold text-emerald-600">运行中</div></div>
      </div>

      <div className="space-y-4">
        {students.map((s, i) => {
          const m = metrics[i];
          return (
            <div key={s.id} className="card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{s.displayName} <span className="text-sm font-normal text-slate-400">@{s.username}</span></div>
                  <div className="text-xs text-slate-500">本周学习 {m.weekDays} 天 · 有效学习 {m.effectiveMinutes} 分钟</div>
                </div>
                <Link href={`/admin/students/${s.id}`} className="text-sm text-brand-600 hover:underline">查看详情 →</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <Metric label="今日完成" value={`${m.todayDone} 次`} />
                <Metric label="物理掌握度" value={`${m.physicsMastery}`} />
                <Metric label="化学掌握度" value={`${m.chemistryMastery}`} />
                <Metric label="独立率" value={`${m.independentRate}%`} />
                <Metric label="提示依赖" value={`${m.hintDependency}%`} />
                <Metric label="一模准备度" value={`${m.readiness}`} highlight />
              </div>
              {m.weak.length > 0 && (
                <div className="mt-3 text-xs text-slate-500">
                  需关注：{m.weak.map((w) => <span key={w} className="mr-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{w}</span>)}
                </div>
              )}
              {m.repeated.length > 0 && (
                <div className="mt-2 text-xs text-slate-500">
                  重复错因：{m.repeated.map((w) => <span key={w} className="mr-2 rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{w}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-brand-50" : "bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${highlight ? "text-brand-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
