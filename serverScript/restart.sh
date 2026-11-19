#!/bin/bash

docker compose --env-file .env.prod  -f docker-compose-prod.yml down
docker image rm quantrpeter/bitbrick:1.0
docker compose --env-file .env.prod -f docker-compose-prod.yml up -d

