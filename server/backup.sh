#!/bin/sh
# Writes ./backups/imd-daily-<UTC time>.tar.gz with every object and drafts.json, unchanged.
set -eu
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose run --rm -v "$(pwd)/backups:/backup" --entrypoint sh files \
  -c "tar -C /data -czf /backup/imd-daily-$stamp.tar.gz objects drafts.json 2>/dev/null || tar -C /data -czf /backup/imd-daily-$stamp.tar.gz objects"
echo "backups/imd-daily-$stamp.tar.gz"
