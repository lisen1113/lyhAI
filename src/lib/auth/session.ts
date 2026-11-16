import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { Role, User } from "@prisma/client";

export const SESSION_COOKIE = "physchem_session";
const SESSION_TTL_DAYS = 7;

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // 本阶段经 http://IP:8088 访问（无 TLS），若强制 Secure 浏览器会拒存 Cookie，
    // 表现为「登录成功但立刻退回登录页」。故改为显式开关，默认关闭。
    // 将来挂上 HTTPS 后，把 COOKIE_SECURE 设为 true 即可，无需改代码。
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  return toSessionUser(session.user);
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  await clearSessionCookie();
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}
