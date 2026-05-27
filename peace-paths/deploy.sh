#!/bin/bash
# deploy.sh — Run analysis + deploy to Cloudflare Pages
# Usage: ./deploy.sh [--fast|--daily]
#
# Cron schedule (on LLM server 192.168.2.121):
#   0 * * * *   /path/to/peace-paths/deploy.sh --fast
#   0 6 * * *   /path/to/peace-paths/deploy.sh --daily

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODE="${1:-daily}"

cd "$SCRIPT_DIR"

echo "=== Peace Room Deploy — $MODE ($(date)) ==="

# 1. Run analysis
python3 ai-analyze-prod.py $MODE --deploy

echo "=== Deploy complete ==="
