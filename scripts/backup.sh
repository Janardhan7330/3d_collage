#!/bin/sh
set -eu
umask 077
: "${PGHOST:?Set PGHOST}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${PGUSER:?Set PGUSER}"
destination="${1:?Usage: sh scripts/backup.sh /secure/path/backup.dump}"
pg_dump --format=custom --no-owner --file="$destination"
pg_restore --list "$destination" > /dev/null
printf 'Database backup written and archive index verified.\n'
