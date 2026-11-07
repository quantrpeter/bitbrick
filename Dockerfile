# syntax=docker/dockerfile:1

# ---------- Stage 1: PHP dependencies ----------
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install \
        --no-dev --no-scripts --no-autoloader \
        --no-interaction --no-progress --prefer-dist \
        --ignore-platform-reqs
COPY . .
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative --no-scripts

# ---------- Stage 2: React / Three.js designer bundle ----------
# Replaces the manual "npm run build, upload public/designer-production" step of the side-loading
# workflow. Tests run here so a broken geometry or share-link format cannot reach production.
FROM node:22-alpine AS designer
WORKDIR /app/designer
COPY designer/package.json designer/package-lock.json ./
RUN npm ci
COPY designer/ ./
RUN npm test
# webpack writes to ../public/designer-production
RUN npm run build && test -s /app/public/designer-production/bundle.js

# ---------- Stage 3: Runtime ----------
FROM php:8.4-fpm-bookworm AS app

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx supervisor unzip curl \
        libzip-dev libonig-dev libxml2-dev libpng-dev libicu-dev \
    && docker-php-ext-configure intl \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_mysql mbstring bcmath zip pcntl opcache intl gd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# phpredis for the Redis session/cache/queue backend.
RUN apt-get update && apt-get install -y --no-install-recommends $PHPIZE_DEPS \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get purge -y --auto-remove $PHPIZE_DEPS \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY docker/php.ini /usr/local/etc/php/conf.d/zzz-app.ini

WORKDIR /var/www/html

# Application code (optimized autoloader) + the built designer bundle
COPY --from=vendor /app /var/www/html
COPY --from=designer /app/public/designer-production /var/www/html/public/designer-production

RUN rm -f /var/www/html/.env \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

COPY docker/nginx.conf /etc/nginx/sites-available/default
COPY docker/supervisord.conf /etc/supervisor/conf.d/app.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1/up >/dev/null || exit 1

ENTRYPOINT ["entrypoint"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/app.conf"]
