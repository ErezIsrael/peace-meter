#!/bin/bash
# auto-deploy.sh — Hourly: run AI analysis + deploy to Cloudflare Pages
#
# Cron schedule (on the server where peace-paths lives):
#   0 * * * *   /path/to/peace-paths/auto-deploy.sh >> /path/to/peace-paths/deploy-log.txt 2>&1
#
# This runs --fast mode (last 2h of articles) and deploys to Cloudflare via wrangler.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOGFILE="$SCRIPT_DIR/deploy-log.txt"

echo "[$(date)] === Peace Room Auto-Deploy (fast) ===" >> "$LOGFILE"

# Run analysis + deploy
python3 ai-analyze-prod.py --fast --deploy >> "$LOGFILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] SUCCESS" >> "$LOGFILE"
else
    echo "[$(date)] FAILED (exit code: $EXIT_CODE)" >> "$LOGFILE"
fi

echo "[$(date)] === Done ===" >> "$LOGFILE"
echo "" >> "$LOGFILE"

exit $EXIT_CODE
