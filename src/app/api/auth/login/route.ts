import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "输入无效", details: parsed.error.issues } },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" } },
        { status: 401 }
      );
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
