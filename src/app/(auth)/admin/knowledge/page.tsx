import { prisma } from "@/lib/db";
import KnowledgeTree from "@/components/admin/KnowledgeTree";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const nodes = await prisma.knowledgeNode.findMany({ orderBy: [{ subjectId: "asc" }, { order: "asc" }] });
  const subjects = await prisma.subject.findMany({ orderBy: { code: "asc" } });
  const skills = await prisma.microSkill.findMany({ orderBy: { code: "asc" } });
  const counts = {
    nodes: nodes.length,
    skills: skills.length,
    prereqs: await prisma.knowledgePrerequisite.count(),
  };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">知识体系</h1>
        <p className="mt-1 text-sm text-slate-500">Subject → Module → Unit → KnowledgeNode → MicroSkill</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="card"><div className="text-sm text-slate-500">节点总数</div><div className="mt-1 text-2xl font-bold">{counts.nodes}</div></div>
        <div className="card"><div className="text-sm text-slate-500">微技能</div><div className="mt-1 text-2xl font-bold">{counts.skills}</div></div>
        <div className="card"><div className="text-sm text-slate-500">前置依赖</div><div className="mt-1 text-2xl font-bold">{counts.prereqs}</div></div>
      </div>
      <KnowledgeTree nodes={JSON.parse(JSON.stringify(nodes))} subjects={JSON.parse(JSON.stringify(subjects))} />
    </div>
  );
}
