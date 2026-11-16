#!/usr/bin/env bash
# 一键回滚到指定版本（只重启 app，不动数据库、不动其他项目）
# 用法：/opt/phychem-trainer/scripts/rollback.sh 1.0.0
set -euo pipefail
cd /opt/phychem-trainer

TARGET=${1:?用法: rollback.sh <目标版本tag，例如 1.0.0>}

if ! docker image inspect "${APP_IMAGE_REPO:-phychem-trainer}:$TARGET" > /dev/null 2>&1; then
  echo "镜像 ${APP_IMAGE_REPO:-phychem-trainer}:$TARGET 不存在，中止。" >&2
  echo "现有镜像：" >&2
  docker image ls "${APP_IMAGE_REPO:-phychem-trainer}" --format '  {{.Repository}}:{{.Tag}}' >&2
  exit 1
fi

cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${APP_IMAGE_REPO:-phychem-trainer}:$TARGET|" .env
sed -i "s|^APP_VERSION=.*|APP_VERSION=$TARGET|" .env

echo "[rollback] 切换到 :$TARGET 并重启 app …"
docker compose -p phychem-trainer up -d --no-deps --force-recreate app

for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/api/health || true)
  if [ "$code" = "200" ]; then
    echo "[rollback] 成功 → :$TARGET（health 200）"
    exit 0
  fi
  sleep 3
done

echo "[rollback] 回滚后健康检查未通过，请查看：docker compose -p phychem-trainer logs --tail=80 app" >&2
exit 1
