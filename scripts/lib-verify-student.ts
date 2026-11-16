// 验收脚本专用学生账号。
// 验收脚本会大量写入/清空 session、attempt、mastery 等数据，绝不能跑在真实学生账号上，
// 否则会抹掉孩子的真实学习进度。这里统一使用用户名以 "__" 开头的专用账号，
// 界面侧的学生列表查询会过滤掉该类账号（见 admin/dashboard、admin/reports）。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const VERIFY_USERNAME = "__verify";
export const VERIFY_PASSWORD = "verify-only-not-for-login";

/** 取（必要时创建）验收专用学生账号 */
export async function ensureVerifyStudent(p: PrismaClient) {
  const existed = await p.user.findUnique({ where: { username: VERIFY_USERNAME } });
  if (existed) return existed;

  const passwordHash = await bcrypt.hash(VERIFY_PASSWORD, 10);
  return p.user.create({
    data: {
      username: VERIFY_USERNAME,
      passwordHash,
      displayName: "验收测试账号（勿用）",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { create: { grade: 8 } },
    },
  });
}
