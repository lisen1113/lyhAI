import QuestionBank from "@/components/admin/QuestionBank";

export default function QuestionsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">题库管理</h1>
        <p className="mt-1 text-sm text-slate-500">浏览、筛选、审核题目；支持 CSV 批量导入（暂存后需审核发布）</p>
      </div>
      <QuestionBank />
    </div>
  );
}
