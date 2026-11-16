import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "physchem_session";

// 边缘中间件只做粗粒度 Cookie 存在性检查 + 角色路径前缀拦截。
// 精细鉴权（DB 校验会话有效性、角色）在各 Route Handler / Server Component 内完成。
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  const isStudentArea = pathname.startsWith("/student");
  const isAdminArea = pathname.startsWith("/admin");
  const isProtectedApi =
    pathname.startsWith("/api/student/") || pathname.startsWith("/api/admin/");

  if ((isStudentArea || isAdminArea || isProtectedApi) && !token) {
    // API 请求返回 401 JSON，避免 fetch 被重定向到 HTML 登录页导致解析失败
    if (isProtectedApi) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 管理员路径/API 仅允许持 token 访问；精确角色校验在服务端完成。
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/student/:path*",
    "/admin/:path*",
    "/api/student/:path*",
    "/api/admin/:path*",
  ],
};
