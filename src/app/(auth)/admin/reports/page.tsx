import { prisma } from "@/lib/db";
import { getStudentMetrics, listRealStudents } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const students = await listRealStudents();
  const reports = await Promise.all(students.map(async (s) => ({ student: s, metrics: await getStudentMetrics(s.id) })));
  const group = await prisma.studyGroup.findFirst();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">周报</h1>
        <p className="mt-1 text-sm text-slate-500">本周学习汇总（按 Asia/Shanghai 展示）。</p>
      </div>

      {group && (
        <div className="card bg-brand-50/60">
          <div className="font-semibold text-brand-700">🤝 {group.name}</div>
          <div className="mt-1 text-sm text-slate-600">共同目标：{group.goal}</div>
          <div className="mt-2 text-xs text-slate-500">合作机制只展示共同进步，不做成员排名。</div>
        </div>
      )}

      <div className="space-y-3">
        {reports.map(({ student, metrics }) => (
          <div key={student.id} className="card">
            <div className="mb-3 font-semibold text-slate-800">{student.displayName} 的本周小结</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">学习天数</div><div className="mt-1 text-xl font-bold">{metrics.weekDays} 天</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">有效时长</div><div className="mt-1 text-xl font-bold">{metrics.effectiveMinutes} 分</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">首次独立率</div><div className="mt-1 text-xl font-bold">{metrics.independentRate}%</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">练习总量</div><div className="mt-1 text-xl font-bold">{metrics.totalAttempts}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
