import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import AssessmentRunner from "@/components/student/AssessmentRunner";

export const dynamic = "force-dynamic";

export default async function AssessmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const assessments = await prisma.assessment.findMany({
    where: { status: { not: "SCHEDULED" } },
    include: {
      questions: { include: { question: { select: { id: true, stem: true, type: true, options: true, standardAnswer: true } } }, orderBy: { order: "asc" } },
      attempts: { where: { studentId: user.id }, select: { score: true, analysis: true, completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">诊断与周测</h1>
        <p className="mt-1 text-sm text-slate-500">通过小测验，帮助系统更准确地找到你最需要提升的地方。</p>
      </div>

      {assessments.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-4xl">📝</div>
          <p className="mt-3 text-sm text-slate-500">老师还没有发布测验，先去完成今日训练吧。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{a.title}</div>
                  <div className="text-xs text-slate-500">{a.type === "DIAGNOSTIC" ? "分段诊断" : a.type === "WEEKLY" ? "周测" : "模拟测"} · {a.questions.length} 题</div>
                </div>
                {a.attempts.length > 0 ? (
                  <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">已完成 · {a.attempts[0].score} 分</span>
                ) : null}
              </div>
              {a.attempts.length === 0 && (
                <div className="mt-3">
                  <AssessmentRunner assessmentId={a.id} questions={JSON.parse(JSON.stringify(a.questions.map((q) => q.question)))} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
