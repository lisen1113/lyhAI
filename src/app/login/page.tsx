import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800">物理化学 AI 训练系统</h1>
          <p className="mt-2 text-sm text-slate-500">每天 30 分钟，稳步提升</p>
        </div>
        <Suspense fallback={<div className="card text-center text-slate-500">加载中…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
