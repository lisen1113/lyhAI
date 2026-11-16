import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { StudentNav } from "@/components/student/StudentNav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect("/admin/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <StudentNav displayName={user.displayName} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
