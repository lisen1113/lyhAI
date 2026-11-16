import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "待点亮", INTRO: "刚接触", LEARNING: "学习中",
  BASIC: "基础掌握", PROFICIENT: "熟练掌握", STABLE: "稳定掌握",
};

function dayKey(d: Date) {
  return new Date(d.getTime()).toISOString().slice(0, 10);
}

export default async function GrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  const [attempts, sessions, masteries, achievements, logs] = await Promise.all([
    prisma.questionAttempt.findMany({
      where: { studentId: user.id },
      include: { question: { select: { stem: true } } },
      orderBy: { submittedAt: "desc" }, take: 300,
    }),
    prisma.practiceSession.findMany({
      where: { studentId: user.id, status: "COMPLETED" },
      orderBy: { endedAt: "desc" },
    }),
    prisma.studentMastery.findMany({
      where: { studentId: user.id }, include: { microSkill: true, node: true },
    }),
    prisma.studentAchievement.findMany({
      where: { studentId: user.id }, include: { achievement: true }, orderBy: { awardedAt: "desc" },
    }),
    prisma.masteryChangeLog.findMany({
      where: { mastery: { studentId: user.id } },
      orderBy: { createdAt: "desc" }, take: 50,
      include: { mastery: { include: { microSkill: true } } },
    }),
  ]);

  const total = attempts.length;
  const firstTry = attempts.filter((a) => a.outcome === "FIRST_TRY_CORRECT").length;
  const independentRate = total ? Math.round((firstTry / total) * 100) : 0;
  const hintUsed = attempts.filter((a) => a.outcome.startsWith("CORRECT_AFTER_HINT")).length;
  const solutionUsed = attempts.filter((a) => a.outcome === "CORRECT_AFTER_SOLUTION").length;

  // 连续训练天数
  const daySet = new Set(attempts.map((a) => dayKey(a.submittedAt)));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i++) {
    if (daySet.has(dayKey(cursor))) streak++;
    else if (i > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 近 7 天独立率趋势
  const trend: { day: string; label: string; total: number; independent: number; rate: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = dayKey(d);
    const list = attempts.filter((a) => dayKey(a.submittedAt) === key);
    const ind = list.filter((a) => a.outcome === "FIRST_TRY_CORRECT").length;
    trend.push({
      day: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      total: list.length,
      independent: ind,
      rate: list.length ? Math.round((ind / list.length) * 100) : 0,
    });
  }
  const activeDays = trend.filter((t) => t.total > 0);
  const recentRate = activeDays.length
    ? Math.round(activeDays.reduce((a, t) => a + t.rate, 0) / activeDays.length)
    : 0;

  const last7 = attempts.filter((a) => a.submittedAt >= new Date(Date.now() - 7 * 86400000));
  const prev7 = attempts.filter(
    (a) => a.submittedAt < new Date(Date.now() - 7 * 86400000) && a.submittedAt >= since
  );
  const rateOf = (arr: typeof attempts) =>
    arr.length ? Math.round((arr.filter((a) => a.outcome === "FIRST_TRY_CORRECT").length / arr.length) * 100) : 0;
  const hintRateOf = (arr: typeof attempts) =>
    arr.length ? Math.round((arr.filter((a) => a.outcome.startsWith("CORRECT_AFTER_HINT")).length / arr.length) * 100) : 0;
  const deltaIndependent = activeDays.length >= 2 ? rateOf(last7) - rateOf(prev7) : 0;
  const deltaHint = prev7.length ? hintRateOf(last7) - hintRateOf(prev7) : 0;

  const litCount = masteries.filter((m) => m.status !== "NOT_STARTED").length;
  const mastered = masteries.filter((m) => m.status === "PROFICIENT" || m.status === "STABLE");
  const improved = logs.filter((l) => l.newScore > l.oldScore).slice(0, 6);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">成长记录</h1>
        <p className="mt-1 text-sm text-slate-500">这里记录的是「越来越能自己做」的证据，不是排名。</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-brand-700">{independentRate}%</div>
          <div className="text-xs text-slate-500">首次独立率</div>
        </div>
        <div className="card text-center">
          <div className={`text-2xl font-bold ${deltaIndependent >= 0 ? "text-emerald-600" : "text-slate-500"}`}>
            {deltaIndependent >= 0 ? "+" : ""}{deltaIndependent}%
          </div>
          <div className="text-xs text-slate-500">近 7 天变化</div>
        </div>
        <div className="card text-center">
          <div className={`text-2xl font-bold ${deltaHint <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
            {deltaHint > 0 ? "+" : ""}{deltaHint}%
          </div>
          <div className="text-xs text-slate-500">提示依赖变化</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-amber-600">{streak}</div>
          <div className="text-xs text-slate-500">连续训练天数</div>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">近 7 天：不用提示也能做对的比例</h2>
          <span className="text-xs text-slate-400">平均 {recentRate}%</span>
        </div>
        <div className="flex items-end gap-2" style={{ height: 108 }}>
          {trend.map((t) => (
            <div key={t.day} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-slate-400">{t.total ? `${t.rate}%` : ""}</span>
              <div className="flex w-full items-end justify-center" style={{ height: 70 }}>
                {t.total > 0 ? (
                  <div
                    className="w-full max-w-[26px] rounded-t-md bg-emerald-400/80"
                    style={{ height: `${Math.max(4, (t.rate / 100) * 70)}px` }}
                    title={`${t.total} 题，独立 ${t.independent} 题`}
                  />
                ) : (
                  <div className="h-1 w-full max-w-[26px] rounded bg-slate-100" />
                )}
              </div>
              <span className="text-[10px] text-slate-400">{t.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          柱子越高，说明越多的题是你自己想出来的，而不是靠提示。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card text-center"><div className="text-xl font-bold text-brand-700">{litCount}</div><div className="text-xs text-slate-500">点亮知识点</div></div>
        <div className="card text-center"><div className="text-xl font-bold text-emerald-600">{mastered.length}</div><div className="text-xs text-slate-500">达到掌握</div></div>
        <div className="card text-center"><div className="text-xl font-bold text-sky-600">{hintUsed}</div><div className="text-xs text-slate-500">用提示学会</div></div>
        <div className="card text-center"><div className="text-xl font-bold text-slate-600">{solutionUsed}</div><div className="text-xs text-slate-500">看解析学会</div></div>
      </div>

      {improved.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">📈 最近修复的知识点</h2>
          <div className="space-y-2">
            {improved.map((l) => (
              <div key={l.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {l.mastery.microSkill?.name ?? "技能"}
                </span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, l.newScore)}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-xs text-slate-500">
                  {Math.round(l.oldScore)}→{Math.round(l.newScore)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mastered.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">🌟 已经稳定的技能</h2>
          <div className="flex flex-wrap gap-2">
            {mastered.slice(0, 12).map((m) => (
              <span key={m.id} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
                {m.microSkill?.name ?? "技能"}
                <span className="ml-1 text-[10px] text-emerald-500">{STATUS_LABEL[m.status]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {achievements.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">🏅 我的成就</h2>
          <div className="flex flex-wrap gap-2">
            {achievements.map((a) => (
              <span key={a.id} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
                {a.achievement.icon ?? "★"} {a.achievement.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold text-slate-800">最近的练习</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">还没有练习记录，开始今天的训练吧。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {attempts.slice(0, 10).map((a) => {
              const label =
                a.outcome === "FIRST_TRY_CORRECT" ? "独立完成"
                  : a.outcome === "CORRECT_AFTER_SOLUTION" ? "看解析后明白"
                    : a.correct ? "借提示完成" : "待修复";
              const cls =
                a.outcome === "FIRST_TRY_CORRECT" ? "bg-emerald-50 text-emerald-700"
                  : a.correct ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600";
              return (
                <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate text-slate-700">{a.question?.stem.slice(0, 34)}…</span>
                  <span className={`ml-3 shrink-0 rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
