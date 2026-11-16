"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseOptions } from "@/lib/utils/options";
import katex from "katex";
import "katex/dist/katex.min.css";

type ErrorTag = { id: string; name: string; category: string };
type Question = {
  id: string; type: string; stem: string; options: unknown;
  standardAnswer: string; solution: string;
  hints: { level: number; content: string }[];
  errorTags: ErrorTag[];
};
type Item = {
  itemId: string; segment: string; plannedMinutes: number; completedAt: string | null;
  variantLevel: number; isTemplate: boolean; nodeName: string;
  question: Question;
};
type MicroLesson = {
  itemId: string; code: string; name: string; nodeName: string; minutes: number;
  context: string; coreConcept: string; formula: string;
  pitfalls: string[]; example: string; completed: boolean;
};
type SegMeta = { name: string; desc: string; icon: string; goal: string };
type Feedback = {
  correct: boolean; firstTry: boolean; outcome: string;
  answer: string; solution: string; attemptId: string;
  errorOptions: ErrorTag[]; knowledgeNode: string;
};

const SEG_ORDER = ["WARMUP", "REVIEW", "MICRO_LEARN", "PRACTICE", "INDEPENDENT", "SUMMARY"];

function renderMath(text: string) {
  try {
    return text.replace(/\$([^$]+)\$/g, (_, expr) =>
      katex.renderToString(expr, { throwOnError: false, displayMode: false })
    );
  } catch { return text; }
}

/** 解析文本按行拆分，便于「已知 / 公式 / 运算」分段显示 */
function splitSolution(s: string): string[] {
  return s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
}

const LEVEL_LABEL: Record<number, { text: string; cls: string }> = {
  1: { text: "原型题", cls: "bg-slate-100 text-slate-600" },
  2: { text: "轻变式", cls: "bg-sky-50 text-sky-700" },
  3: { text: "情境变式", cls: "bg-violet-50 text-violet-700" },
};

type SubjectTab = { code: string; total: number; completed: number; active: boolean };

export default function TodayPractice({
  planId, totalMinutes, primarySubject, items, microLesson, segmentMeta, focusNodes, subjectTabs,
}: {
  planId: string; totalMinutes: number; primarySubject: string;
  items: Item[]; microLesson: MicroLesson | null;
  segmentMeta: Record<string, SegMeta>;
  focusNodes: string[];
  subjectTabs?: SubjectTab[];
}) {
  // 只保留有内容的段
  const segments = useMemo(
    () => SEG_ORDER.filter((s) => s === "MICRO_LEARN" ? !!microLesson : s === "SUMMARY" ? true : items.some((i) => i.segment === s)),
    [items, microLesson]
  );

  const [phase, setPhase] = useState<"intro" | "segIntro" | "learn" | "question" | "summary">("intro");
  const [segIdx, setSegIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [sawSolution, setSawSolution] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pickedErrors, setPickedErrors] = useState<string[]>([]);
  const [errorSaved, setErrorSaved] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ correct: boolean; firstTry: boolean; usedHint: boolean; level: number }[]>([]);
  const [satisfaction, setSatisfaction] = useState<"EASY" | "JUST_RIGHT" | "HARD" | null>(null);
  const [learned, setLearned] = useState(microLesson?.completed ?? false);
  const [summarySent, setSummarySent] = useState(false);

  const startRef = useRef<number>(Date.now());

  const seg = segments[segIdx] ?? "SUMMARY";
  const segItems = useMemo(() => items.filter((i) => i.segment === seg), [items, seg]);
  const current: Item | undefined = segItems[qIdx];

  // 进入题目段时开始计时
  useEffect(() => {
    if (phase === "question") startRef.current = Date.now();
  }, [phase, qIdx, segIdx]);

  async function ensureSession() {
    if (sessionId) return sessionId;
    const res = await fetch("/api/student/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const json = await res.json();
    if (json.data?.id) {
      setSessionId(json.data.id);
      return json.data.id as string;
    }
    return null;
  }

  function goNextSegment() {
    if (segIdx + 1 >= segments.length) {
      setPhase("summary");
      return;
    }
    setSegIdx(segIdx + 1);
    setQIdx(0);
    setFeedback(null); setAnswer(""); setHintLevel(0); setSawSolution(false);
    setShowSolution(false); setPickedErrors([]); setErrorSaved(false);
    setPhase("segIntro");
  }

  async function startSeg() {
    await ensureSession();
    if (seg === "MICRO_LEARN") setPhase("learn");
    else if (seg === "SUMMARY") setPhase("summary");
    else { setQIdx(0); setPhase("question"); }
  }

  async function markLearned() {
    if (!microLesson) return;
    setLearned(true);
    setLoading(true);
    try {
      await fetch("/api/student/plan/learn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planItemId: microLesson.itemId }),
      });
    } catch { /* 离线也不阻断 */ }
    setLoading(false);
  }

  async function submit() {
    if (!current || !answer.trim()) return;
    setLoading(true);
    const sid = await ensureSession();
    if (!sid) { setLoading(false); return; }
    const idempotencyKey = `${planId}:${current.question.id}:${current.itemId}`;
    const timeSpentSec = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
    const res = await fetch("/api/student/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        sessionId: sid, questionId: current.question.id, answer,
        maxHintLevel: hintLevel, sawSolution, timeSpentSec,
        planItemId: current.itemId,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      const d = json.data;
      const firstTry = d.outcome === "FIRST_TRY_CORRECT";
      setFeedback({
        correct: d.correct, firstTry, outcome: d.outcome,
        answer: d.standardAnswer, solution: d.solution, attemptId: d.attemptId,
        errorOptions: d.errorOptions ?? [], knowledgeNode: d.knowledgeNode ?? "",
      });
      setResults((r) => [...r, { correct: d.correct, firstTry, usedHint: hintLevel > 0 || sawSolution, level: current.variantLevel }]);
    }
    setLoading(false);
  }

  async function saveErrors() {
    if (!feedback || pickedErrors.length === 0) { setErrorSaved(true); return; }
    setLoading(true);
    try {
      await fetch("/api/student/attempt/error", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: feedback.attemptId, errorTagIds: pickedErrors }),
      });
      setErrorSaved(true);
    } catch { setErrorSaved(true); }
    setLoading(false);
  }

  function nextQuestion() {
    setFeedback(null); setAnswer(""); setHintLevel(0);
    setSawSolution(false); setShowSolution(false);
    setPickedErrors([]); setErrorSaved(false);
    if (qIdx + 1 < segItems.length) setQIdx(qIdx + 1);
    else goNextSegment();
  }

  async function finishSession() {
    const sid = await ensureSession();
    if (sid && satisfaction) {
      await fetch(`/api/student/session/${sid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: satisfaction }),
      });
    }
    setSummarySent(true);
  }

  // ---------------- 开屏 ----------------
  if (phase === "intro") {
    const doneCount = items.filter((i) => i.completedAt).length;
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">今日训练</h1>
          <p className="mt-1 text-sm text-slate-500">
            今天约 {totalMinutes} 分钟，共 {segments.length} 个环节。不是刷题——先学一个小点，再逐步放手让你自己做。
          </p>
        </div>

        <div className="card space-y-3 bg-brand-50/60">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-700">今天先练哪一科</span>
            <span className="text-sm text-brand-700">
              {items.length} 道题{doneCount > 0 ? `（已完成 ${doneCount}）` : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(subjectTabs ?? [{ code: primarySubject, total: items.length, completed: doneCount, active: true }]).map((t) => (
              <Link
                key={t.code}
                href={`/student/today?subject=${t.code}`}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  t.active
                    ? "border-brand-500 bg-white shadow-sm"
                    : "border-brand-100 bg-white/60 hover:border-brand-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${t.active ? "text-brand-700" : "text-slate-600"}`}>
                    {t.code === "PH" ? "物理" : "化学"}
                  </span>
                  {t.active && <span className="text-[10px] font-medium text-brand-600">进行中</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {t.total === 0 ? "今天还没开始" : `已完成 ${t.completed}/${t.total} 题`}
                </div>
              </Link>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            每天完成一科即可（约 25 分钟）。某一科被别的事情耽误了，可以随时切过去补上，两科进度各自记录、互不覆盖。
          </p>
        </div>

        <div className="space-y-2">
          {segments.map((s, i) => {
            const meta = segmentMeta[s];
            const count = items.filter((x) => x.segment === s).length;
            return (
              <div key={s} className="card flex items-center gap-3 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{meta.name}</div>
                  <div className="truncate text-xs text-slate-500">{meta.desc}</div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {s === "MICRO_LEARN" ? `${microLesson?.minutes ?? 5} 分钟` : s === "SUMMARY" ? "1 分钟" : `${count} 题`}
                </span>
              </div>
            );
          })}
        </div>

        <button className="btn-primary w-full py-3" onClick={async () => { await ensureSession(); setPhase("segIntro"); }} disabled={loading}>
          {loading ? "准备中…" : "开始今天的训练"}
        </button>
      </div>
    );
  }

  // ---------------- 段落过场 ----------------
  if (phase === "segIntro") {
    const meta = segmentMeta[seg];
    const count = seg === "MICRO_LEARN" ? 1 : segItems.length;
    return (
      <div className="space-y-5">
        <ProgressHeader segIdx={segIdx} segments={segments} segmentMeta={segmentMeta} />
        <div className="card py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">
            {meta.icon}
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-800">{meta.name}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">{meta.goal}</p>
          <p className="mt-1 text-xs text-slate-400">
            {seg === "SUMMARY" ? "1 分钟" : `${count} ${seg === "MICRO_LEARN" ? "个知识点" : "道题"} · 约 ${segItems.reduce((a, b) => a + b.plannedMinutes, 0) || microLesson?.minutes || 5} 分钟`}
          </p>
          <button className="btn-primary mt-6 w-full sm:w-auto sm:px-10" onClick={startSeg}>
            {seg === "MICRO_LEARN" ? "开始学习" : seg === "SUMMARY" ? "查看总结" : "开始这一段"}
          </button>
        </div>
      </div>
    );
  }

  // ---------------- 微知识学习 ----------------
  if (phase === "learn" && microLesson) {
    const exampleLines = splitSolution(microLesson.example);
    return (
      <div className="space-y-4">
        <ProgressHeader segIdx={segIdx} segments={segments} segmentMeta={segmentMeta} />

        <div className="card">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded bg-brand-50 px-2 py-0.5 text-brand-700">今天只学这一个</span>
            <span>{microLesson.nodeName}</span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-slate-800">{microLesson.name}</h2>

          {/* 情境 */}
          <div className="mt-4 rounded-xl bg-amber-50/70 p-3">
            <div className="mb-1 text-xs font-medium text-amber-700">先想一想</div>
            <p className="text-sm leading-relaxed text-slate-700">{microLesson.context}</p>
          </div>

          {/* 核心概念 */}
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="mb-1 text-xs font-medium text-slate-500">核心概念</div>
            <p className="text-sm leading-relaxed text-slate-800">{microLesson.coreConcept}</p>
          </div>

          {/* 公式 */}
          {microLesson.formula && (
            <div className="mt-3 rounded-xl bg-brand-50/70 p-3">
              <div className="mb-1 text-xs font-medium text-brand-700">公式 / 规则</div>
              <div
                className="text-sm leading-relaxed text-slate-800"
                dangerouslySetInnerHTML={{ __html: renderMath(microLesson.formula) }}
              />
            </div>
          )}

          {/* 常见坑 */}
          {microLesson.pitfalls.length > 0 && (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
              <div className="mb-1 text-xs font-medium text-rose-700">容易踩的坑</div>
              <ul className="space-y-1">
                {microLesson.pitfalls.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-rose-500">·</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 基础例题 */}
          {exampleLines.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="mb-1 text-xs font-medium text-slate-500">跟我做一遍</div>
              <div className="space-y-1.5">
                {exampleLines.map((line, i) => (
                  <p
                    key={i}
                    className={`text-sm leading-relaxed ${i === 0 ? "text-slate-800" : "text-slate-600"}`}
                    dangerouslySetInnerHTML={{ __html: renderMath(line) }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="btn-primary w-full py-3"
          onClick={async () => { await markLearned(); goNextSegment(); }}
          disabled={loading}
        >
          {learned ? "我复习完了，去练习" : "我学会了，去练习"}
        </button>
        <p className="text-center text-xs text-slate-400">
          看得懂不等于会做——接下来会用 3 个层级的题检验
        </p>
      </div>
    );
  }

  // ---------------- 答题 ----------------
  if (phase === "question" && current) {
    const q = current.question;
    const options = parseOptions(q.options);
    const isIndependent = seg === "INDEPENDENT";
    // 独立通关本应是变式题；题库不足时会退到原型题，此时如实标为「巩固题」，不假装是变式
    const lv = isIndependent && current.variantLevel === 1
      ? { text: "巩固题", cls: "bg-slate-100 text-slate-600" }
      : LEVEL_LABEL[current.variantLevel] ?? LEVEL_LABEL[1];
    const firstOfSegment = qIdx === 0;

    return (
      <div className="space-y-4">
        <ProgressHeader segIdx={segIdx} segments={segments} segmentMeta={segmentMeta} />

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 font-medium ${lv.cls}`}>{lv.text}</span>
            <span className="text-slate-500">{current.nodeName}</span>
          </div>
          <span className="text-slate-500">第 {qIdx + 1} / {segItems.length} 题</span>
        </div>

        {isIndependent && firstOfSegment && (
          <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
            这一段不给提示，用来检验「离开提示还能不能做」。做不出来也没关系，看完解析我们再来。
          </div>
        )}
        {isIndependent && current.variantLevel === 1 && firstOfSegment && (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            今天这个知识点的变式题还不够，这一段先用原型题确认你自己能独立完成。
          </div>
        )}
        {seg === "PRACTICE" && firstOfSegment && current.variantLevel === 1 && (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            先按例题的步骤做一遍。做对后，后面的题会换问法、换情境。
          </div>
        )}

        <div className="card">
          <div
            className="text-base leading-relaxed text-slate-800"
            dangerouslySetInnerHTML={{ __html: renderMath(q.stem) }}
          />

          {options ? (
            <div className="mt-4 space-y-2">
              {options.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setAnswer(o.key)}
                  disabled={!!feedback}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${answer === o.key ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium">{o.key}</span>
                  <span className="text-sm text-slate-700">{o.text}</span>
                </button>
              ))}
            </div>
          ) : q.type === "TRUE_FALSE" ? (
            <div className="mt-4 flex gap-3">
              {["正确", "错误"].map((v) => (
                <button
                  key={v}
                  onClick={() => setAnswer(v)}
                  disabled={!!feedback}
                  className={`flex-1 rounded-xl border p-3 text-sm ${answer === v ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <input
              className="input mt-4"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="输入你的答案（单位一并写上更稳妥）"
              disabled={!!feedback}
            />
          )}
        </div>

        {/* 递进提示：独立段不提供 */}
        {!isIndependent && !feedback && q.hints.length > 0 && (
          <div className="card bg-amber-50/50 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-amber-800">
                {hintLevel === 0 ? "卡住了？可以要一个方向提示" : `已用 ${hintLevel} 层提示`}
              </span>
              {hintLevel < 3 && (
                <button
                  className="rounded-lg bg-amber-100 px-3 py-1 text-xs text-amber-800"
                  onClick={() => setHintLevel(hintLevel + 1)}
                >
                  {hintLevel === 0 ? "提示 1：方向" : hintLevel === 1 ? "提示 2：关键条件" : "提示 3：公式框架"}
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {q.hints.filter((h) => h.level <= hintLevel).map((h) => (
                <div key={h.level} className="rounded-lg bg-white p-2 text-sm text-slate-700">
                  <span className="mr-1 text-xs font-medium text-amber-700">
                    L{h.level} {h.level === 1 ? "方向" : h.level === 2 ? "条件" : "公式"}
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: renderMath(h.content) }} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-amber-700/80">提示用几层会被记录，用来判断是真会还是靠提示。</p>
          </div>
        )}

        {/* 完整解析入口（独立段允许，但记为看过解析） */}
        {!feedback && (
          <div className="text-center">
            {showSolution ? (
              <div className="card text-left">
                <div className="mb-2 text-sm font-medium text-slate-800">完整解析</div>
                <div className="space-y-1.5">
                  {splitSolution(q.solution).map((line, i) => (
                    <p key={i} className="text-sm leading-relaxed text-slate-700"
                       dangerouslySetInnerHTML={{ __html: renderMath(line) }} />
                  ))}
                </div>
                <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">
                  <b>规范答案：</b><span dangerouslySetInnerHTML={{ __html: renderMath(q.standardAnswer) }} />
                </div>
              </div>
            ) : (
              <button
                className="text-xs text-slate-400 underline-offset-2 hover:underline"
                onClick={() => { setShowSolution(true); setSawSolution(true); }}
              >
                我完全没思路，看完整解析
              </button>
            )}
          </div>
        )}

        {!feedback && (
          <button className="btn-primary w-full py-3" onClick={submit} disabled={loading || !answer.trim()}>
            {loading ? "提交中…" : "提交答案"}
          </button>
        )}

        {/* 反馈 */}
        {feedback && (
          <div className={`card ${feedback.correct ? "bg-emerald-50/50" : "bg-sky-50/50"}`}>
            <div className="font-medium text-slate-800">
              {feedback.firstTry
                ? "第一次就独立做对了，这个点是真的会了"
                : feedback.correct
                  ? "做对了。下次试试不看提示——那才算真的掌握"
                  : "这题没做对，正好是今天要修复的地方"}
            </div>

            {!feedback.correct && (
              <>
                <div className="mt-2 rounded-lg bg-white p-2 text-sm">
                  <b>正确答案：</b>
                  <span dangerouslySetInnerHTML={{ __html: renderMath(feedback.answer) }} />
                </div>
                <div className="mt-2 space-y-1.5">
                  {splitSolution(feedback.solution).map((line, i) => (
                    <p key={i} className="text-sm leading-relaxed text-slate-700"
                       dangerouslySetInnerHTML={{ __html: renderMath(line) }} />
                  ))}
                </div>

                {/* 错因自诊 */}
                {feedback.errorOptions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-medium text-slate-600">
                      这一步卡在哪？（可多选，帮我记住你的薄弱点）
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {feedback.errorOptions.map((t) => {
                        const on = pickedErrors.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            onClick={() =>
                              setPickedErrors((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id].slice(0, 3)))
                            }
                            disabled={errorSaved}
                            className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
                          >
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                    {!errorSaved ? (
                      <button
                        className="mt-2 text-xs text-brand-700 underline-offset-2 hover:underline"
                        onClick={saveErrors}
                        disabled={loading}
                      >
                        {pickedErrors.length ? "记下来" : "暂时说不好，跳过"}
                      </button>
                    ) : (
                      <div className="mt-2 text-xs text-emerald-700">已记录，之后会重点复测这个点</div>
                    )}
                  </div>
                )}
              </>
            )}

            <button className="btn-primary mt-4 w-full" onClick={nextQuestion}>
              {qIdx + 1 < segItems.length ? "下一题" : segIdx + 1 < segments.length ? "进入下一环节" : "查看今日总结"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------------- 总结 ----------------
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const independent = results.filter((r) => r.firstTry).length;
  const usedHint = results.filter((r) => r.usedHint).length;
  const byLevel = [1, 2, 3].map((lv) => ({
    lv,
    total: results.filter((r) => r.level === lv).length,
    ok: results.filter((r) => r.level === lv && r.firstTry).length,
  }));

  return (
    <div className="space-y-4">
      <div className="card text-center">
        <div className="text-4xl">🎯</div>
        <h1 className="mt-2 text-xl font-bold text-slate-800">今天修复了这些</h1>
        {focusNodes.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {focusNodes.map((n) => (
              <span key={n} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{n}</span>
            ))}
          </div>
        )}
        {microLesson && (
          <p className="mt-2 text-xs text-slate-500">今天学的微知识：{microLesson.name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="完成题数" value={`${total}`} cls="text-brand-700" />
        <Stat label="首次独立做对" value={`${independent}`} cls="text-emerald-600" />
        <Stat label="用提示后做对" value={`${Math.max(0, correct - independent)}`} cls="text-amber-600" />
        <Stat label="用过提示的题" value={`${usedHint}`} cls="text-sky-600" />
      </div>

      <div className="card">
        <div className="mb-2 text-sm font-semibold text-slate-800">三个层级的表现</div>
        <div className="space-y-2">
          {byLevel.map((b) => (
            <div key={b.lv} className="flex items-center gap-3">
              <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] ${LEVEL_LABEL[b.lv].cls}`}>
                {LEVEL_LABEL[b.lv].text}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: b.total ? `${(b.ok / b.total) * 100}%` : "0%" }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs text-slate-500">
                {b.total === 0 ? "—" : `${b.ok}/${b.total} 独立`}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          原型题靠记忆，轻变式靠理解，情境变式靠迁移。三层都能独立做对，才算真的会。
        </p>
      </div>

      <div className="card">
        <div className="mb-2 text-sm font-semibold text-slate-800">今天的难度感受？</div>
        <div className="flex gap-2">
          {([["EASY", "容易"], ["JUST_RIGHT", "正合适"], ["HARD", "有点难"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSatisfaction(k)}
              disabled={summarySent}
              className={`flex-1 rounded-xl border py-2 text-sm ${satisfaction === k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">这个反馈会用来调整明天的题量和难度。</p>
      </div>

      <button
        className="btn-primary w-full py-3"
        onClick={finishSession}
        disabled={!satisfaction || summarySent}
      >
        {summarySent ? "已记录，明天继续" : "完成今天的训练"}
      </button>

      {summarySent && (
        <div className="card bg-emerald-50/60 text-center text-sm text-emerald-800">
          今天的训练已保存。明天会先复测今天的知识点，别忘了回来。
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="card text-center">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ProgressHeader({
  segIdx, segments, segmentMeta,
}: {
  segIdx: number; segments: string[]; segmentMeta: Record<string, SegMeta>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium text-brand-700">
          第 {segIdx + 1}/{segments.length} 环节 · {segmentMeta[segments[segIdx]]?.name}
        </span>
        <span>{Math.round((segIdx / segments.length) * 100)}%</span>
      </div>
      <div className="flex gap-1">
        {segments.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i < segIdx ? "bg-brand-500" : i === segIdx ? "bg-brand-300" : "bg-slate-200"}`}
          />
        ))}
      </div>
    </div>
  );
}
