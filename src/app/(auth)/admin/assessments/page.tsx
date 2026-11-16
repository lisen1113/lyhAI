import AssessmentManager from "@/components/admin/AssessmentManager";

export default function AssessmentsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">测验管理</h1>
        <p className="mt-1 text-sm text-slate-500">创建诊断与周测，学生完成后自动更新学习重点。</p>
      </div>
      <AssessmentManager />
    </div>
  );
}
