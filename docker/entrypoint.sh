#!/bin/sh
set -e

cd /var/www/html

if [ -z "${APP_KEY:-}" ]; then
    echo "APP_KEY is not set. Generate one with: docker run --rm <image> php artisan key:generate --show" >&2
    exit 1
fi

# Writable runtime directories (storage is a mounted volume in production).
mkdir -p \
    storage/framework/cache \
    storage/framework/sessions \
    storage/framework/views \
    storage/app/public \
    storage/logs \
    bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

echo "Waiting for database connection..."
tries=0
until php artisan db:show >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
        echo "Database did not become ready in time." >&2
        exit 1
    fi
    sleep 2
done
echo "Database is ready."

php artisan storage:link || true
php artisan migrate --force

# Cache config/routes/views for production performance.
php artisan config:cache
php artisan route:cache
php artisan view:cache

exec "$@"
