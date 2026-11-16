#!/usr/bin/env bash
# 在本环境（工具调用结束回收子进程）下，同一条命令内完成：启动PG → 执行参数命令 → 停止PG
# 用法：bash scripts/db-migrate.sh "npx prisma migrate dev --name init"
#       bash scripts/db-migrate.sh "npm run prisma:seed"
set -e

PG_BIN="/d/pgdata_physchem/bin"
PG_DATA="D:/pgdata_physchem/data"
PG_LOG="/d/pgdata_physchem/server.log"
PORT=55433
CMD="${1:-}"

if [ -z "$CMD" ]; then
  echo "Usage: $0 \"<command to run with DB up>\""
  exit 1
fi

started=0
is_running() {
  "$PG_BIN/pg_ctl.exe" -D "$PG_DATA" status >/dev/null 2>&1
}

if is_running; then
  echo "[db] PG already running."
else
  echo "[db] Starting PG on $PORT ..."
  "$PG_BIN/pg_ctl.exe" -D "$PG_DATA" -l "$PG_LOG" -o "-p $PORT -h 127.0.0.1" start
  started=1
  # 等待就绪
  for i in $(seq 1 20); do
    if "$PG_BIN/pg_ctl.exe" -D "$PG_DATA" status >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
fi

set +e
echo "[db] Running: $CMD"
eval "$CMD"
code=$?
set -e

if [ "$started" -eq 1 ]; then
  echo "[db] Stopping PG ..."
  "$PG_BIN/pg_ctl.exe" -D "$PG_DATA" stop >/dev/null 2>&1 || true
fi

exit $code
