#!/usr/bin/env bash
# 每日数据库备份：pg_dump 自定义格式 + 完整性校验 + 保留 15 份（≥14 天）
# 用法：/opt/phychem-trainer/scripts/backup-db.sh
set -euo pipefail
DIR=/opt/phychem-trainer/backups
KEEP=15
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"

# shellcheck disable=SC1091
set -a; . /opt/phychem-trainer/.env; set +a

DUMP="$DIR/physchem_$STAMP.dump"
TMP="$DUMP.tmp"

if ! docker exec phychem-db pg_dump -U "${PG_USER:-physchem}" -d "${PG_DATABASE:-physchem_v1}" -Fc > "$TMP"; then
  echo "[$(date -Is)] ERROR 备份失败（容器是否在运行？）" >&2
  rm -f "$TMP"
  exit 1
fi

# 完整性校验：能列出目录才算有效备份
if ! docker exec -i phychem-db pg_restore -l < "$TMP" > /dev/null 2>&1; then
  echo "[$(date -Is)] ERROR 备份校验失败，保留 $TMP 供排查" >&2
  exit 1
fi

mv "$TMP" "$DUMP"

# 仅保留最近 15 份
ls -1t "$DIR"/physchem_*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
done

SIZE=$(du -h "$DUMP" | cut -f1)
echo "[$(date -Is)] OK $DUMP ($SIZE)"
