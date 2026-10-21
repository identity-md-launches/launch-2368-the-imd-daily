#!/bin/sh
# Usage: ./restore.sh backups/imd-daily-<time>.tar.gz  (restores into the data volume; existing objects are kept)
set -eu
[ -f "$1" ] || { echo "backup file not found"; exit 1; }
docker compose run --rm -v "$(realpath "$1"):/restore.tar.gz:ro" --entrypoint sh files \
  -c "tar -C /data -xzf /restore.tar.gz --skip-old-files && cd /data/objects && for f in *; do h=\${f%%.*}; [ \"\$(sha256sum \"\$f\" | cut -c1-64)\" = \"\$h\" ] || echo \"HASH MISMATCH \$f\"; done; echo restored"
