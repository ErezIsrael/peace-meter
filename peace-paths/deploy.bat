@echo off
REM deploy.bat - Run analysis + deploy to Cloudflare Pages (Windows)
REM Usage: deploy.bat [--fast|--daily]
REM
REM For Windows Task Scheduler (on LLM server):
REM   Hourly: deploy.bat --fast
REM   Daily at 6am: deploy.bat --daily

cd /d "%~dp0"

echo === Peace Room Deploy — %1 (%date% %time%) ===

python ai-analyze-prod.py %1 --deploy

echo === Deploy complete ===
