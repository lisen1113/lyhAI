"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "登录失败");
        return;
      }
      const role = json.data.user.role;
      const next = params.get("next");
      if (next && next.startsWith("/")) {
        router.push(next);
      } else {
        router.push(role === "ADMIN" ? "/admin/dashboard" : "/student/today");
      }
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">用户名</label>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="请输入用户名"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">密码</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="请输入密码"
        />
      </div>
      {error && <p className="text-sm text-amber-600">{error}</p>}
      <button className="btn-primary w-full" type="submit" disabled={loading}>
        {loading ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
