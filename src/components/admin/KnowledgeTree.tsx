"use client";

import { useState, useMemo } from "react";

type Node = {
  id: string; code: string; name: string; level: string;
  subjectId: string; parentId: string | null; examWeight: number; order: number;
};
type Subject = { id: string; code: string; name: string };

const levelLabel: Record<string, string> = {
  MODULE: "模块", UNIT: "单元", KNOWLEDGE_NODE: "知识点", SUBJECT: "学科",
};

export default function KnowledgeTree({ nodes, subjects }: { nodes: Node[]; subjects: Subject[] }) {
  const [filter, setFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("ALL");

  const childrenMap = useMemo(() => {
    const m = new Map<string | null, Node[]>();
    for (const n of nodes) {
      const key = n.parentId;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(n);
    }
    return m;
  }, [nodes]);

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const subjectCodeOf = (node: Node): string => {
    // 向上找根模块的学科
    let cur: Node | undefined = node;
    while (cur?.parentId) cur = nodes.find((n) => n.id === cur!.parentId);
    const sid = cur?.subjectId ?? node.subjectId;
    return subjectById.get(sid)?.code ?? "";
  };

  function matches(node: Node): boolean {
    const q = filter.trim().toLowerCase();
    const nameOk = !q || node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q);
    const subOk = subjectFilter === "ALL" || subjectCodeOf(node) === subjectFilter;
    return nameOk && subOk;
  }

  function subtreeHasMatch(node: Node): boolean {
    if (matches(node)) return true;
    const kids = childrenMap.get(node.id) ?? [];
    return kids.some(subtreeHasMatch);
  }

  function renderNode(node: Node, depth: number): React.ReactNode {
    if (!subtreeHasMatch(node)) return null;
    const kids = childrenMap.get(node.id) ?? [];
    return (
      <div key={node.id} className="border-l border-slate-200 pl-3" style={{ marginLeft: depth === 0 ? 0 : 4 }}>
        <div className={`flex items-center gap-2 py-1.5 ${matches(node) ? "" : "opacity-60"}`}>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            node.level === "MODULE" ? "bg-brand-100 text-brand-700" :
            node.level === "UNIT" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
          }`}>{levelLabel[node.level] ?? node.level}</span>
          <span className="text-sm text-slate-800">{node.name}</span>
          <span className="font-mono text-[10px] text-slate-400">{node.code}</span>
          {node.examWeight >= 0.85 && <span className="text-[10px] text-amber-600">重点</span>}
        </div>
        {kids.length > 0 && <div>{kids.map((k) => renderNode(k, depth + 1))}</div>}
      </div>
    );
  }

  const roots = childrenMap.get(null) ?? [];

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="搜索知识点名称或编码"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="input max-w-[160px]" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
          <option value="ALL">全部学科</option>
          {subjects.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}
        </select>
      </div>
      <div className="max-h-[600px] overflow-y-auto pr-2">
        {roots.map((r) => renderNode(r, 0))}
      </div>
    </div>
  );
}
