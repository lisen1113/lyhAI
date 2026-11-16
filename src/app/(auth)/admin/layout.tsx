import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/student/today");

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav displayName={user.displayName} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
