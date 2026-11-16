#!/usr/bin/env bash
# 本地开发启动：PostgreSQL(55433) + Next dev(3200) 同一进程组，避免被回收
set -e
APP="D:/李语涵学习助手开发/物理化学AI自适应训练系统V1"
cd "$APP"

# 启动 PG（若已在运行则跳过）
if ! netstat -ano | grep -q "127.0.0.1:55433.*LISTENING"; then
  "/d/pgdata_physchem/bin/postgres.exe" -D "D:/pgdata_physchem/data" -p 55433 -h 127.0.0.1 > /tmp/pg.log 2>&1 &
  sleep 4
fi

echo "[start] cwd=$(pwd)"
exec node "$APP/node_modules/next/dist/bin/next" dev -p 3200
