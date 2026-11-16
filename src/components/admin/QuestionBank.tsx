"use client";

import { useEffect, useState } from "react";

type Question = {
  id: string; stem: string; type: string; difficulty: string; reviewStatus: string;
  standardAnswer: string; source: string | null;
  subject: { name: string; code: string };
  knowledgeLinks: { node: { name: string; code: string }; isPrimary: boolean }[];
  _count: { attempts: number };
};

const typeLabel: Record<string, string> = {
  SINGLE_CHOICE: "单选", TRUE_FALSE: "判断", FILL_BLANK: "填空", NUMERIC: "数值", STEP_BY_STEP: "分步",
};
const statusLabel: Record<string, string> = {
  DRAFT: "草稿", PENDING: "待审核", APPROVED: "已通过", PUBLISHED: "已发布", REJECTED: "已拒绝",
};

export default function QuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState("");
  const [importResult, setImportResult] = useState("");

  const load = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (subject) params.set("subject", subject);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    fetch(`/api/admin/questions?${params}`)
      .then((r) => r.json())
      .then((j) => { setQuestions(j.data?.questions ?? []); setTotal(j.data?.total ?? 0); });
  };

  useEffect(() => { load(); }, [page, subject, status]);

  async function setStatusOf(id: string, newStatus: string) {
    const res = await fetch("/api/admin/questions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reviewStatus: newStatus }),
    });
    if (res.ok) load();
  }

  async function doSearch() { setPage(1); load(); }

  async function doImport(confirm: boolean) {
    const res = await fetch("/api/admin/questions/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, confirm }),
    });
    const j = await res.json();
    if (confirm) {
      setImportResult(`已导入 ${j.data?.imported ?? 0} 题（均为待审核状态）`);
      load();
    } else {
      setImportResult(`校验完成：${j.data?.validCount ?? 0}/${j.data?.total ?? 0} 行有效`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">学科</label>
            <select className="input w-32" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">全部</option>
              <option value="PH">物理</option><option value="CH">化学</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">状态</label>
            <select className="input w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">搜索题干</label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="输入关键词" />
          </div>
          <button className="btn-primary" onClick={doSearch}>搜索</button>
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => setShowImport(!showImport)}>
            CSV 导入
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">共 {total} 题</div>
      </div>

      {showImport && (
        <div className="card space-y-3">
          <div className="text-sm font-medium">CSV 批量导入</div>
          <p className="text-xs text-slate-500">列顺序：学科代码,题型,难度,题干,选项JSON,答案,解析,Hint1,Hint2,Hint3,知识点code,来源。题型用单选/判断/填空/数值/分步，难度用1-5。</p>
          <textarea className="input h-32 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="PH,数值,1,一个质量2kg的物体重力是多少？,,19.6N,...,PH-M07-U01-K02,import" />
          <div className="flex gap-2">
            <button className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm" onClick={() => doImport(false)}>校验预览</button>
            <button className="btn-primary" onClick={() => doImport(true)}>确认导入（暂存）</button>
            {importResult && <span className="self-center text-sm text-slate-600">{importResult}</span>}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{q.subject.name}</span>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">{typeLabel[q.type] ?? q.type}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{q.difficulty}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${q.reviewStatus === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{statusLabel[q.reviewStatus] ?? q.reviewStatus}</span>
                </div>
                <div className="mt-2 text-sm text-slate-800">{q.stem}</div>
                {expanded === q.id && (
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <div><b>答案：</b>{q.standardAnswer}</div>
                    <div><b>知识点：</b>{q.knowledgeLinks.map((k) => k.node.name).join("、") || "未关联"}</div>
                    <div><b>来源：</b>{q.source ?? "-"}</div>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button className="text-xs text-brand-600" onClick={() => setExpanded(expanded === q.id ? null : q.id)}>详情</button>
                {q.reviewStatus === "PENDING" && <>
                  <button className="text-xs text-emerald-600" onClick={() => setStatusOf(q.id, "PUBLISHED")}>发布</button>
                  <button className="text-xs text-slate-500" onClick={() => setStatusOf(q.id, "REJECTED")}>拒绝</button>
                </>}
                {q.reviewStatus === "PUBLISHED" && <button className="text-xs text-slate-500" onClick={() => setStatusOf(q.id, "DRAFT")}>下架</button>}
              </div>
            </div>
          </div>
        ))}
        {questions.length === 0 && <div className="card text-center text-sm text-slate-500">暂无题目</div>}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
        <span className="text-sm text-slate-600">第 {page} 页</span>
        <button className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</button>
      </div>
    </div>
  );
}
