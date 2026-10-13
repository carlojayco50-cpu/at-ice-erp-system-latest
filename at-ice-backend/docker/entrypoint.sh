#!/bin/sh
set -e
cd /var/www/html

# Volumes mount over storage/app/public and storage/app/private, so re-assert
# ownership every start.
mkdir -p storage/app/public storage/app/private storage/framework/cache/data storage/framework/sessions \
         storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

artisan() { su-exec www-data php artisan "$@"; }

artisan config:cache
artisan route:cache
artisan view:cache
artisan event:cache

# Only the web container migrates; the queue worker must not race it.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    tries=0
    until artisan migrate --force; do
        tries=$((tries + 1))
        if [ "$tries" -ge 20 ]; then
            echo "Database not reachable after $tries attempts, giving up." >&2
            exit 1
        fi
        echo "Migration failed (database not ready?), retrying in 3s..." >&2
        sleep 3
    done
fi

# php-fpm's master must start as root (it drops workers to www-data itself);
# anything else (queue worker, artisan) runs unprivileged.
if [ "$1" = "php-fpm" ]; then
    exec "$@"
fi
exec su-exec www-data "$@"
