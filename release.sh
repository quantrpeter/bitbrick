#!/usr/bin/env bash
# Build and push the multi-arch production image.   ./release.sh [version]
set -euo pipefail
VERSION="${1:-1.0}"
docker buildx build --platform linux/amd64,linux/arm64 -t "quantrpeter/bitbrick:${VERSION}" --push .
echo "Pushed quantrpeter/bitbrick:${VERSION}. On the server: docker compose --env-file .env.prod -f docker-compose-prod.yml pull && docker compose --env-file .env.prod -f docker-compose-prod.yml up -d"
