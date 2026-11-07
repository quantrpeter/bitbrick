@echo off
setlocal

rem The default "docker" driver cannot build linux/amd64,linux/arm64.
rem A docker-container builder can. Create it once, then reuse it.
docker buildx inspect wps-multi >nul 2>&1
if errorlevel 1 (
    docker buildx create --name wps-multi --driver docker-container --use
    if errorlevel 1 exit /b 1
) else (
    docker buildx use wps-multi
    if errorlevel 1 exit /b 1
)

docker buildx build --platform linux/amd64,linux/arm64 -t quantrpeter/bitbrick:1.0 --push .
exit /b %ERRORLEVEL%

