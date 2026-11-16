"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/student/today", label: "今日训练" },
  { href: "/student/knowledge", label: "知识地图" },
  { href: "/student/review", label: "到期复测" },
  { href: "/student/growth", label: "成长记录" },
  { href: "/student/assessment", label: "诊断/周测" },
];

export function StudentNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="font-semibold text-brand-700">物理化学训练</div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">{displayName}</span>
          <button onClick={logout} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            退出
          </button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              pathname === l.href ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
