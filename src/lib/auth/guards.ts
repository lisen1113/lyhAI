import { Role } from "@prisma/client";
import { getCurrentUser, SessionUser } from "./session";

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "FORBIDDEN",
    message: string
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHORIZED", "请先登录");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError("FORBIDDEN", "无权访问");
  }
  return user;
}
