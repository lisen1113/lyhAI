// 清理与新V2题逐字重复的旧题（软删除，保留答题审计链）
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const DUP_SOURCES = ["PQ-TF-2", "PQ-C-1", "CQ-C-0"];
async function main() {
  const rows = await p.question.findMany({ where: { source: { in: DUP_SOURCES } }, select: { id: true, source: true } });
  for (const r of rows) {
    await p.question.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
    console.log(`soft-deleted duplicate: ${r.source}`);
  }
  console.log(`Total deduped: ${rows.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => p.$disconnect());
