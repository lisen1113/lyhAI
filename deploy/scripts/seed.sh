#!/usr/bin/env bash
# 一次性初始化：建表 + 灌数据 + 建正式账号
# 只允许在空库上执行；重复执行是幂等的（各 seed 脚本按 source 查重），但会较慢。
#
# 用法：/opt/phychem-trainer/scripts/seed.sh
set -euo pipefail
cd /opt/phychem-trainer
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${PG_PASSWORD:?缺少 PG_PASSWORD}"
: "${TOOLS_IMAGE:?缺少 TOOLS_IMAGE（运维工具镜像地址）}"
: "${SEED_PASSWORD:?缺少 SEED_PASSWORD（学生初始密码）}"

echo "[seed] 使用镜像：$TOOLS_IMAGE"
echo "[seed] 目标数据库：${PG_DATABASE:-physchem_v1} @ db:5432"

docker run --rm --network phychem-trainer-net \
  -e DATABASE_URL="postgresql://${PG_USER:-physchem}:${PG_PASSWORD}@db:5432/${PG_DATABASE:-physchem_v1}?schema=public" \
  -e SEED_PASSWORD="$SEED_PASSWORD" \
  -e TZ=Asia/Shanghai \
  "$TOOLS_IMAGE" sh -lc '
set -e

echo "== 1/11 迁移建表 =="
npx prisma migrate deploy

echo "== 2/11 学科基础数据 =="
npx tsx prisma/seed-base.ts

echo "== 3/11 知识树与微技能 =="
npx tsx prisma/seed-knowledge.ts

echo "== 4/11 错因标签 =="
npx tsx prisma/seed-error-tags.ts

echo "== 5/11 基础题库（生成器） =="
npx tsx prisma/seed-questions.ts

echo "== 6/11 题库 v2 =="
npx tsx prisma/seed-question-bank-v2.ts

echo "== 7/11 题库 v3 =="
npx tsx prisma/seed-question-bank-v3.ts

echo "== 8/11 题库 v5–v21 =="
npx tsx prisma/seed-question-bank-v5v6.ts

echo "== 9/11 回填微技能绑定（v2/v3 不写 microSkillId） =="
npx tsx scripts/backfill-microskill.ts

echo "== 10/11 校准变式层级 =="
npx tsx scripts/sync-variant-level.ts

echo "== 11/11 成就 + 正式账号 =="
npx tsx prisma/seed-achievements.ts
npx tsx prisma/seed-production.ts

echo "== 验收：题库密度 =="
npx tsx scripts/progress.ts
'
echo "[seed] 完成"
