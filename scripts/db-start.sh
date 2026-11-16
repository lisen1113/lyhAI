#!/usr/bin/env bash
# 手动启动本地 PG（注意：本环境工具调用结束时子进程会被回收，仅适合同会话内使用）
set -e
PG_BIN="/d/pgdata_physchem/bin"
PG_DATA="D:/pgdata_physchem/data"
PG_LOG="/d/pgdata_physchem/server.log"
"$PG_BIN/pg_ctl.exe" -D "$PG_DATA" -l "$PG_LOG" -o "-p 55433 -h 127.0.0.1" start
"$PG_BIN/pg_ctl.exe" -D "$PG_DATA" status
