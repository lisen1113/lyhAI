"use client";

import { useEffect, useState } from "react";

type Assessment = {
  id: string; title: string; type: string; status: string;
  createdAt: string; _count: { questions: number; attempts: number };
};

export default function AssessmentManager() {
  const [list, setList] = useState<Assessment[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("DIAGNOSTIC");
  const [subject, setSubject] = useState("PH");
  const [count, setCount] = useState(10);
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/admin/assessments").then((r) => r.json()).then((j) => setList(j.data ?? []));
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim()) { setMsg("请输入标题"); return; }
    const res = await fetch("/api/admin/assessments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type, subjectCode: subject, questionCount: count }),
    });
    const j = await res.json();
    if (res.ok) { setMsg("创建成功"); setTitle(""); load(); }
    else setMsg(j.error?.message ?? "创建失败");
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-3 font-semibold text-slate-800">创建新测验</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">标题</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：第3周物理周测" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">类型</label>
            <select className="input w-32" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="DIAGNOSTIC">诊断</option><option value="WEEKLY">周测</option><option value="MOCK">模拟测</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">学科</label>
            <select className="input w-24" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="PH">物理</option><option value="CH">化学</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">题数</label>
            <input className="input w-20" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <button className="btn-primary" onClick={create}>创建</button>
        </div>
        {msg && <p className="mt-2 text-sm text-slate-500">{msg}</p>}
      </div>

      <div className="space-y-2">
        {list.length === 0 && <div className="card text-center text-sm text-slate-500">暂无测验</div>}
        {list.map((a) => (
          <div key={a.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800">{a.title}</div>
              <div className="text-xs text-slate-500">{a.type === "DIAGNOSTIC" ? "诊断" : a.type === "WEEKLY" ? "周测" : "模拟测"} · {a._count.questions} 题 · {a._count.attempts} 人作答</div>
            </div>
            <span className={`rounded px-2 py-1 text-xs ${a.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {a.status === "COMPLETED" ? "已完成" : "待作答"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
