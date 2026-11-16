import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/student/today");
  }
  redirect("/login");
}
