#!/bin/sh
# Usage: ./restore.sh backups/imd-daily-<time>.tar.gz  (restores into the data volume; existing objects are kept)
set -eu
[ -f "${1:-}" ] || { echo "backup file not found" >&2; exit 1; }
docker compose run --rm -v "$(realpath "$1"):/restore.tar.gz:ro" --entrypoint sh files \
  -c 'set -eu
tar -C /data -xzkf /restore.tar.gz
cd /data/objects
for f in *; do
  [ -f "$f" ] || continue
  h=${f%%.*}
  actual=$(sha256sum "$f")
  if [ "${actual%% *}" != "$h" ]; then
    echo "HASH MISMATCH $f" >&2
    exit 1
  fi
done
echo restored'
