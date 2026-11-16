import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * 健康检查接口（部署验证 / 容器 healthcheck 用）
 * - 正常：200 {"status":"ok","db":"ok"}
 * - 数据库不可用：503 {"status":"degraded","db":"down"}
 * 不返回连接串、主机名等敏感信息；中间件 matcher 未覆盖 /api，天然免鉴权。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let db: "ok" | "down" = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "down";
  }

  const ok = db === "ok";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: process.env.APP_VERSION ?? "unknown",
      db,
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
