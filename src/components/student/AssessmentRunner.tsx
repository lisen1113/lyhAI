"use client";
import { parseOptions } from "@/lib/utils/options";

import { useState } from "react";

type Q = { id: string; stem: string; type: string; options: unknown; standardAnswer: string };

export default function AssessmentRunner({ assessmentId, questions }: { assessmentId: string; questions: Q[] }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ accuracy: number; correct: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch("/api/student/assessment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assessmentId,
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
      }),
    });
    const json = await res.json();
    if (res.ok) setResult(json.data);
    setLoading(false);
  }

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>开始测验</button>;

  if (result) {
    return (
      <div className="rounded-xl bg-brand-50 p-4">
        <div className="font-medium text-slate-800">测验完成！正确 {result.correct} / {result.total} 题</div>
        <p className="mt-1 text-sm text-slate-600">系统已根据你的表现更新了学习重点。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const opts = parseOptions(q.options);
        return (
          <div key={q.id} className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-medium text-slate-700">{i + 1}. {q.stem}</div>
            {opts ? (
              <div className="mt-2 space-y-1">
                {opts.map((o) => (
                  <label key={o.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input type="radio" name={q.id} checked={answers[q.id] === o.key} onChange={() => setAnswers({ ...answers, [q.id]: o.key })} />
                    {o.key}. {o.text}
                  </label>
                ))}
              </div>
            ) : (
              <input className="input mt-2" value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="你的答案" />
            )}
          </div>
        );
      })}
      <button className="btn-primary" onClick={submit} disabled={loading}>{loading ? "提交中…" : "提交测验"}</button>
    </div>
  );
}
