#!/bin/sh
set -eu
: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${RESTORE_DATABASE:?Set RESTORE_DATABASE to a new empty database}"
archive="${1:?Usage: sh scripts/restore.sh /secure/path/backup.dump}"
# No --clean: existing objects cause an error instead of being overwritten.
pg_restore --single-transaction --exit-on-error --no-owner --dbname="$RESTORE_DATABASE" "$archive"
printf 'Restore completed. Verify before switching traffic.\n'
