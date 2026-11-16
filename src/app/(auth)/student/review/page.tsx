import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const INTERVALS = [1, 3, 7, 14, 30];

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reviews = await prisma.reviewSchedule.findMany({
    where: { studentId: user.id },
    include: { microSkill: true, node: true },
    orderBy: { nextReviewAt: "asc" },
  });
  const due = reviews.filter((r) => r.nextReviewAt <= new Date());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">到期复测</h1>
        <p className="mt-1 text-sm text-slate-500">按 1 / 3 / 7 / 14 / 30 天的节奏，帮你把学过的牢固下来。</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center"><div className="text-2xl font-bold text-amber-600">{due.length}</div><div className="text-xs text-slate-500">今天到期</div></div>
        <div className="card text-center"><div className="text-2xl font-bold text-brand-700">{reviews.length}</div><div className="text-xs text-slate-500">复测计划总数</div></div>
      </div>

      {reviews.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-4xl">📅</div>
          <p className="mt-3 text-sm text-slate-500">完成训练后，系统会自动安排复测时间。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => {
            const isDue = r.nextReviewAt <= new Date();
            const dateStr = r.nextReviewAt.toISOString().slice(0, 10);
            return (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800">{r.microSkill.name}</div>
                  <div className="text-xs text-slate-500">{r.node.name} · 第 {r.stage + 1} 轮复测</div>
                </div>
                <div className="text-right">
                  <div className={`rounded px-2 py-0.5 text-xs ${isDue ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {isDue ? "今天复习" : dateStr}
                  </div>
                  {r.remedial && <div className="mt-1 text-[10px] text-sky-600">回固基础中</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-center text-xs text-slate-400">到期复测会自动安排进「今日训练」，也可以在这里查看进度。</p>
    </div>
  );
}
